// @ts-nocheck
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SalesUseCases } from '../../application/use-cases/SalesUseCases';
import { registerSalesTools } from './registerSalesTools';

export class McpServerAdapter {
  private server: McpServer;
  private app: express.Application;
  private transports: Record<string, StreamableHTTPServerTransport> = {};

  constructor(private readonly useCases: SalesUseCases) {
    this.app = express();

    this.app.use(cors());
    this.app.use(express.json());

    this.server = new McpServer({
      name: 'agent-sales',
      version: '1.0.0',
    });

    registerSalesTools(this.server, this.useCases);
    this.setupHttpServer();
  }

  private setupHttpServer() {
    this.app.post('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.transports[sessionId]) {
          transport = this.transports[sessionId];
        } else if (!sessionId && req.body && req.body.method === 'initialize') {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              this.transports[newSessionId] = transport;
            }
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid && this.transports[sid]) {
              delete this.transports[sid];
            }
          };

          await this.server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        } else {
          res.status(400).json({ error: 'No valid session ID provided or invalid init request' });
          return;
        }

        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error(error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal Server Error' });
        }
      }
    });

    this.app.get('/mcp', async (req, res) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      if (!sessionId || !this.transports[sessionId]) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      const transport = this.transports[sessionId];
      await transport.handleRequest(req, res);
    });
  }

  async start(port = 3001) {
    return new Promise<void>((resolve) => {
      this.app.listen(port, () => {
        console.log(`Agent Sales MCP Streamable HTTP server running on port ${port}`);
        console.log(`Endpoint: http://localhost:${port}/mcp`);
        resolve();
      });
    });
  }
}
