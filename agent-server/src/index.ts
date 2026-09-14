import * as dotenv from "dotenv";
import path from "node:path";
import express from "express";
import cors from "cors";
import {
  createOdooAdapter,
  getOdooConnectionConfig,
  mountMcpEndpoint,
} from "agent-core";
import { createInventoryModule } from "agent-inventory";
import { createSalesModule } from "agent-sales";

const envPath = path.resolve(__dirname, "../../.env");
const dotenvResult = dotenv.config({ path: envPath });

async function main() {
  if (dotenvResult.error) {
    console.warn(
      `[dotenv] Could not load env file from ${envPath}:`,
      dotenvResult.error.message,
    );
  } else {
    console.log(`[dotenv] Loaded env file from ${envPath}`);
  }

  const config = getOdooConnectionConfig();

  const app = express();
  app.use(cors({ exposedHeaders: ['Mcp-Session-Id', 'MCP-Protocol-Version'] }));
  app.use(express.json());

  const odooAdapter = createOdooAdapter(config);
  await odooAdapter.testOdooConnection();

  const closeInventory = mountMcpEndpoint(app, "/inventory/mcp", () => createInventoryModule(odooAdapter).server);
  const closeSales = mountMcpEndpoint(app, "/sales/mcp", () => createSalesModule(odooAdapter).server);

  const listener = app.listen(config.port, () => {
    console.log(`Agent Server MCP running on port ${config.port}`);
    console.log(
      `Inventory endpoint: http://localhost:${config.port}/inventory/mcp`,
    );
    console.log(`Sales endpoint: http://localhost:${config.port}/sales/mcp`);
  });
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    listener.close();
    await Promise.allSettled([closeInventory(), closeSales()]);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error("Fatal error starting Agent Server MCP:", error);
  process.exit(1);
});
