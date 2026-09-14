import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InventoryUseCases } from '../../application/use-cases/InventoryUseCases';
import { registerInventoryTools } from './registerInventoryTools';
import { mountMcpEndpoint } from './mountMcpEndpoint';

export class McpServerAdapter {
  private readonly app = express();
  constructor(useCases: InventoryUseCases) {
    this.app.use(cors({ exposedHeaders: ['Mcp-Session-Id', 'MCP-Protocol-Version'] }));
    this.app.use(express.json());
    mountMcpEndpoint(this.app, '/mcp', () => {
      const server = new McpServer({ name: 'agent-inventory', version: '1.0.0' });
      registerInventoryTools(server, useCases);
      return server;
    });
  }
  async start(port = 3000) {
    return new Promise<void>((resolve, reject) => {
      this.app.listen(port, () => {
        console.log('MCP inventory endpoint: http://localhost:' + port + '/mcp');
        resolve();
      }).once('error', reject);
    });
  }
}
