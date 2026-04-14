// @ts-nocheck
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { InventoryUseCases } from "../../application/use-cases/InventoryUseCases";
import { registerInventoryTools } from './registerInventoryTools';

export class McpServerAdapter {
  private server: McpServer;
  private useCases: InventoryUseCases;
  private app: express.Application;
  private transports: Record<string, StreamableHTTPServerTransport> = {};

  constructor(useCases: InventoryUseCases) {
    this.useCases = useCases;
    this.app = express();
    
    // Middlewares
    this.app.use(cors());
    this.app.use(express.json());
    
    this.server = new McpServer(
      {
        name: "agent-inventory",
        version: "1.0.0",
      }
    );

    this.setupToolHandlers();
    this.setupHttpServer();
  }

  private setupToolHandlers() {
    registerInventoryTools(this.server, this.useCases);
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
          
          // Connect to the underlying Server instance within McpServer
          await this.server.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        } else {
          res.status(400).json({ error: 'No valid session ID provided or invalid init request' });
          return;
        }
        
        await transport.handleRequest(req, res, req.body);
      } catch (e) {
          console.error(e);
          if (!res.headersSent) res.status(500).json({ error: 'Internal Server Error' });
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

  async start(port: number = 3000) {
    return new Promise<void>((resolve) => {
      this.app.listen(port, () => {
        console.log(`Agent Inventory MCP Streamable HTTP server running on port ${port}`);
        console.log(`Endpoint: http://localhost:${port}/mcp`);
        resolve();
      });
    });
  }
}
