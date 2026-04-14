import { OdooXmlRpcAdapter } from 'agent-inventory';
import { SalesUseCases } from './application/use-cases/SalesUseCases';
import { McpServerAdapter } from './infrastructure/mcp/McpServerAdapter';
import { registerSalesTools } from './infrastructure/mcp/registerSalesTools';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export { SalesUseCases } from './application/use-cases/SalesUseCases';
export { McpServerAdapter } from './infrastructure/mcp/McpServerAdapter';
export { registerSalesTools } from './infrastructure/mcp/registerSalesTools';
export * from './domain/entities/types';

export function createSalesModule(odooAdapter: OdooXmlRpcAdapter) {
  const useCases = new SalesUseCases(odooAdapter);
  const server = new McpServer({
    name: 'agent-server-sales',
    version: '1.0.0',
  });

  registerSalesTools(server, useCases);

  return {
    server,
    useCases,
  };
}
