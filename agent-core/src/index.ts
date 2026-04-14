// @ts-nocheck
import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { OdooXmlRpcAdapter } from 'agent-inventory';

export interface OdooConnectionConfig {
  url: string;
  db: string;
  username: string;
  password: string;
  port: number;
}

export function getOdooConnectionConfig(env: NodeJS.ProcessEnv = process.env): OdooConnectionConfig {
  return {
    url: env.ODOO_URL || 'http://localhost:8069',
    db: env.ODOO_DB || 'postgres',
    username: env.ODOO_USERNAME || 'odoo',
    password: env.ODOO_PASSWORD || 'odoo',
    port: env.PORT ? parseInt(env.PORT, 10) : 3000,
  };
}

export function createOdooAdapter(config: OdooConnectionConfig) {
  return new OdooXmlRpcAdapter(
    config.url,
    config.db,
    config.username,
    config.password
  );
}

export function mountMcpEndpoint(
  app: express.Application,
  path: string,
  server: McpServer
) {
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  app.post(path, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log(`[MCP] POST ${path}`, {
      sessionId: sessionId ?? null,
      method: req.body?.method ?? null,
    });

    try {
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && req.body && req.body.method === 'initialize') {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            transports[newSessionId] = transport;
          }
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
          }
        };

        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        console.error(`[MCP] Invalid session for ${path}`, {
          sessionId: sessionId ?? null,
          method: req.body?.method ?? null,
        });
        res.status(400).json({ error: 'No valid session ID provided or invalid init request' });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error(`[MCP] Request failed on ${path}:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    }
  });

  app.get(path, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log(`[MCP] GET ${path}`, {
      sessionId: sessionId ?? null,
    });
    if (!sessionId || !transports[sessionId]) {
      console.error(`[MCP] Invalid GET session for ${path}`, {
        sessionId: sessionId ?? null,
      });
      res.status(400).send('Invalid or missing session ID');
      return;
    }

    await transports[sessionId].handleRequest(req, res);
  });
}
