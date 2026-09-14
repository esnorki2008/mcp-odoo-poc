import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SalesUseCases } from '../../application/use-cases/SalesUseCases';
import { registerSalesTools } from './registerSalesTools';
import { mountMcpEndpoint } from 'agent-inventory';

export class McpServerAdapter {
  private readonly app = express();
  constructor(useCases: SalesUseCases) {
    this.app.use(cors({ exposedHeaders: ['Mcp-Session-Id', 'MCP-Protocol-Version'] }));
    this.app.use(express.json());
    mountMcpEndpoint(this.app, '/mcp', () => {
      const server = new McpServer({ name: 'agent-sales', version: '1.0.0' });
      registerSalesTools(server, useCases);
      return server;
    });
  }
  async start(port = 3001) {
    return new Promise<void>((resolve, reject) => {
      this.app.listen(port, () => {
        console.log('MCP sales endpoint: http://localhost:' + port + '/mcp');
        resolve();
      }).once('error', reject);
    });
  }
}
