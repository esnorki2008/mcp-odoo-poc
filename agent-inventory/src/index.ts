import { OdooXmlRpcAdapter } from './infrastructure/odoo/OdooXmlRpcAdapter';
import { InventoryUseCases } from './application/use-cases/InventoryUseCases';
import { McpServerAdapter } from './infrastructure/mcp/McpServerAdapter';
import { registerInventoryTools } from './infrastructure/mcp/registerInventoryTools';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export { InventoryUseCases } from './application/use-cases/InventoryUseCases';
export { OdooXmlRpcAdapter } from './infrastructure/odoo/OdooXmlRpcAdapter';
export { McpServerAdapter } from './infrastructure/mcp/McpServerAdapter';
export { registerInventoryTools } from './infrastructure/mcp/registerInventoryTools';
export * from './domain/entities/types';
export * from './domain/ports/InventoryPort';

export function createInventoryModule(odooAdapter: OdooXmlRpcAdapter) {
  const useCases = new InventoryUseCases(odooAdapter);
  const server = new McpServer({
    name: 'agent-server-inventory',
    version: '1.0.0',
  });

  registerInventoryTools(server, useCases);

  return {
    server,
    useCases,
  };
}
