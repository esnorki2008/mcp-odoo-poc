import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

/** Each client owns its server and transport; only domain services are shared. */
export function mountMcpEndpoint(app: express.Application, path: string, createServer: () => McpServer) {
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const fail = (res: express.Response, status: number, message: string) => {
    res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
  };
  app.all(path, async (req, res) => {
    if (!['POST', 'GET', 'DELETE'].includes(req.method)) {
      res.setHeader('Allow', 'POST, GET, DELETE');
      fail(res, 405, 'Method not allowed');
      return;
    }
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId !== undefined && (typeof sessionId !== 'string' || !sessionId)) {
      fail(res, 400, 'Invalid MCP session ID');
      return;
    }
    let transport = typeof sessionId === 'string' ? sessions.get(sessionId) : undefined;
    let created = false;
    try {
      if (!transport) {
        if (sessionId) {
          fail(res, 404, 'Session not found. Initialize a new MCP session.');
          return;
        }
        if (req.method !== 'POST' || !isInitializeRequest(req.body)) {
          fail(res, 400, 'Initialize an MCP session before calling tools.');
          return;
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: randomUUID,
          onsessioninitialized: id => { sessions.set(id, transport!); },
        });
        created = true;
        transport.onclose = () => {
          if (transport?.sessionId) sessions.delete(transport.sessionId);
        };
        await createServer().connect(transport);
      }
      await transport.handleRequest(req, res, req.method === 'POST' ? req.body : undefined);
      if (created && res.statusCode >= 400) await transport.close();
    } catch (error) {
      if (created) await transport?.close();
      console.error('[MCP] Request failed:', error instanceof Error ? error.message : 'Unknown error');
      if (!res.headersSent) fail(res, 500, 'Internal MCP server error');
    }
  });
  return async () => {
    await Promise.allSettled([...sessions.values()].map(transport => transport.close()));
    sessions.clear();
  };
}
