const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createRequire } = require('node:module');
const express = require('express');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { InventoryUseCases, OdooXmlRpcAdapter, createInventoryModule, mountMcpEndpoint } = require('../agent-inventory/dist');
const { SalesUseCases } = require('../agent-sales/dist');
const { getOdooConnectionConfig } = require('../agent-core/dist');
const inventoryRequire = createRequire(require.resolve('../agent-inventory/package.json'));
const xmlrpc = inventoryRequire('xmlrpc');

test('configuration rejects malformed URLs and ports', () => {
  for (const PORT of ['12x', '-1', '1.5', '65536']) {
    assert.throws(() => getOdooConnectionConfig({ PORT }), /PORT/);
  }
  assert.throws(() => getOdooConnectionConfig({ ODOO_URL: 'ftp://localhost' }), /ODOO_URL/);
  assert.equal(getOdooConnectionConfig({ ODOO_URL: 'https://example.com/' }).url, 'https://example.com');
});

test('inventory rejects invalid arguments before accessing Odoo', async () => {
  const useCases = new InventoryUseCases({});
  await assert.rejects(useCases.executeSearchProducts('   '), /empty/);
  await assert.rejects(useCases.executeSearchProducts('a', 0), /limit/);
  for (const id of [NaN, Infinity, 1.5, -1]) {
    await assert.rejects(useCases.executeGetStockLevels(id), /ID/);
    await assert.rejects(useCases.executeUpdateStockQuantity(1, id, 2), /ID/);
  }
  for (const quantity of [NaN, Infinity, -1]) {
    await assert.rejects(useCases.executeUpdateStockQuantity(1, 1, quantity), /Quantity/);
  }
});

test('sales rejects impossible, reversed and silently ignored custom dates', async () => {
  const useCases = new SalesUseCases({});
  for (const [start, end] of [['2026-02-30', '2026-03-01'], ['2026-04-01', '2026-03-01'], ['bad', '2026-01-01']]) {
    await assert.rejects(useCases.executeGetSalesSummary('custom', start, end));
  }
  await assert.rejects(useCases.executeGetSalesSummary('month', '2026-01-01', '2026-02-01'), /custom/);
});

test('sales timeline includes orders beyond the first 1000 and groups UTC dates', async () => {
  const rows = Array.from({ length: 1005 }, () => ({ date_order: '2026-09-01 23:30:00', amount_total: 2 }));
  const offsets = [];
  const useCases = new SalesUseCases({
    searchRead: async (_model, _domain, options) => {
      offsets.push(options.offset);
      return rows.slice(options.offset, options.offset + options.limit);
    },
  });
  assert.deepEqual(await useCases.executeGetSalesTimeline('custom', '2026-09-01', '2026-09-02'), [
    { label: '2026-09-01', totalAmount: 2010, orderCount: 1005 },
  ]);
  assert.deepEqual(offsets, [0, 1000]);
});

test('ambiguous inventory adjustments perform no writes', async () => {
  const adapter = new OdooXmlRpcAdapter('http://localhost', 'db', 'user', 'secret');
  adapter.searchRead = async () => [{ id: 1 }, { id: 2 }];
  adapter.callKw = async () => assert.fail('must not write');
  await assert.rejects(adapter.updateStockQuantity(1, 2, 3), /Multiple stock records/);
});

async function rpcFixture(t, authenticate, execute, timeout = 1000) {
  const server = xmlrpc.createServer({ host: '127.0.0.1', port: 0 });
  await once(server.httpServer, 'listening');
  server.on('authenticate', authenticate);
  server.on('execute_kw', execute);
  t.after(() => new Promise(resolve => {
    server.httpServer.close(resolve);
    server.httpServer.closeAllConnections();
  }));
  return new OdooXmlRpcAdapter('http://127.0.0.1:' + server.httpServer.address().port, 'db', 'user', 'secret', timeout);
}

test('concurrent XML-RPC calls share authentication and preserve independent requests', async t => {
  let authentications = 0;
  const adapter = await rpcFixture(t, (_err, _params, callback) => {
    authentications++;
    setTimeout(() => callback(null, 7), 10);
  }, (_err, params, callback) => callback(null, params[5][0]));
  assert.deepEqual(await Promise.all([adapter.callKw('x', 'read', ['short']), adapter.callKw('x', 'read', ['a longer request'])]), ['short', 'a longer request']);
  assert.equal(authentications, 1);
});

test('authentication failures can be retried on a subsequent call', async t => {
  let attempts = 0;
  const adapter = await rpcFixture(t, (_err, _params, callback) => callback(null, ++attempts === 1 ? false : 7), (_err, _params, callback) => callback(null, 42));
  await assert.rejects(adapter.callKw('x', 'read', []), /Authentication failed/);
  assert.equal(await adapter.callKw('x', 'read', []), 42);
});

test('XML-RPC timeout aborts waiting without automatically repeating a write', async t => {
  let writes = 0;
  const adapter = await rpcFixture(t, (_err, _params, callback) => callback(null, 7), () => { writes++; }, 50);
  await assert.rejects(adapter.callKw('stock.quant', 'write', []), /check current stock before retrying/);
  assert.equal(writes, 1);
});

async function httpFixture(t, createServer) {
  const app = express();
  app.use(express.json());
  const closeSessions = mountMcpEndpoint(app, '/mcp', createServer);
  const listener = app.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  t.after(async () => {
    await closeSessions();
    await new Promise(resolve => {
      listener.close(resolve);
      listener.closeAllConnections();
    });
  });
  return new URL('http://127.0.0.1:' + listener.address().port + '/mcp');
}

test('two MCP clients remain independent and DELETE terminates only one session', async t => {
  const url = await httpFixture(t, () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    server.registerTool('hello', { inputSchema: {} }, async () => ({ content: [{ type: 'text', text: 'ok' }] }));
    return server;
  });
  const a = new Client({ name: 'a', version: '1' });
  const b = new Client({ name: 'b', version: '1' });
  const ta = new StreamableHTTPClientTransport(url);
  const tb = new StreamableHTTPClientTransport(url);
  t.after(async () => { await Promise.allSettled([a.close(), b.close()]); });
  await Promise.all([a.connect(ta), b.connect(tb)]);
  assert.notEqual(ta.sessionId, tb.sessionId);
  const results = await Promise.all([a.callTool({ name: 'hello', arguments: {} }), b.callTool({ name: 'hello', arguments: {} })]);
  assert.equal(results[0].content[0].text, 'ok');
  assert.equal(results[1].content[0].text, 'ok');
  const oldSession = ta.sessionId;
  await ta.terminateSession();
  const response = await fetch(url, { headers: { 'mcp-session-id': oldSession, Accept: 'text/event-stream' } });
  assert.equal(response.status, 404);
  assert.equal((await b.callTool({ name: 'hello', arguments: {} })).content[0].text, 'ok');
});

test('MCP tools expose annotations, structured results and actionable validation', async t => {
  let calls = 0;
  const url = await httpFixture(t, () => createInventoryModule({
    searchProducts: async () => { calls++; return [{ id: 7, name: 'Product' }]; },
  }).server);
  const client = new Client({ name: 'agent', version: '1' });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(url));
  const { tools } = await client.listTools();
  assert.equal(tools.find(tool => tool.name === 'search_products').annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === 'update_stock_quantity').annotations.destructiveHint, true);
  const result = await client.callTool({ name: 'search_products', arguments: { query: 'Product' } });
  assert.equal(result.structuredContent.products[0].id, 7);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  const invalid = await client.callTool({ name: 'search_products', arguments: { query: 'Product', limit: -1 } });
  assert.equal(invalid.isError, true);
  assert.equal(calls, 1);
});
