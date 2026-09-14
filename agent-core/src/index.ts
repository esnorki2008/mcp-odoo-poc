import { OdooXmlRpcAdapter } from 'agent-inventory';
export { mountMcpEndpoint } from 'agent-inventory';

export interface OdooConnectionConfig {
  url: string;
  db: string;
  username: string;
  password: string;
  port: number;
}
export function getOdooConnectionConfig(env: NodeJS.ProcessEnv = process.env): OdooConnectionConfig {
  const url = env.ODOO_URL || 'http://localhost:8069';
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('ODOO_URL must be an HTTP(S) URL without credentials, query or fragment');
  }
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  return {
    url: url.replace(/\/+$/, ''),
    db: env.ODOO_DB || 'postgres',
    username: env.ODOO_USERNAME || 'odoo',
    password: env.ODOO_PASSWORD || 'odoo',
    port,
  };
}
export function createOdooAdapter(config: OdooConnectionConfig) {
  return new OdooXmlRpcAdapter(config.url, config.db, config.username, config.password);
}
