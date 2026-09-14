import { z } from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InventoryUseCases } from '../../application/use-cases/InventoryUseCases';
import { toolResult, toolError } from './toolResult';

const id = z.number().int().positive();
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

export function registerInventoryTools(server: McpServer, useCases: InventoryUseCases) {
  server.registerTool('search_products', {
    description: 'Find Odoo products by name or internal reference (default_code). Start here to obtain productId, then call get_stock_levels. Returns at most limit products ordered by ID; a full page may have additional matches, so narrow the query.',
    annotations: readOnly,
    inputSchema: {
      query: z.string().trim().min(1).describe('Product name or internal reference'),
      limit: z.number().int().min(1).max(100).default(10).describe('Maximum results, 1–100'),
    },
  }, async ({ query, limit }) => {
    try {
      const products = await useCases.executeSearchProducts(query, limit);
      return toolResult({ products, count: products.length, limit, mayHaveMore: products.length === limit });
    } catch (error) { return toolError(error); }
  });

  server.registerTool('get_stock_levels', {
    description: 'Read physical quantity and reserved_quantity per internal location for a productId from search_products. Available quantity is quantity minus reserved_quantity. location_id contains [locationId, name]; use it for an inventory adjustment.',
    annotations: readOnly,
    inputSchema: { productId: id.describe('Product ID from search_products') },
  }, async ({ productId }) => {
    try {
      const levels = await useCases.executeGetStockLevels(productId);
      return toolResult({ productId, levels, count: levels.length });
    } catch (error) { return toolError(error); }
  });

  server.registerTool('update_stock_quantity', {
    description: 'Apply an inventory adjustment to set the ABSOLUTE physical quantity, not an increment. First use search_products and get_stock_levels to resolve IDs and inspect stock. This changes Odoo inventory. Multiple matching lot/package/owner records are rejected. If an error occurs, inspect stock in Odoo before retrying: part of the adjustment may have completed.',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    inputSchema: {
      productId: id.describe('Product ID from search_products'),
      locationId: id.describe('Internal location ID from get_stock_levels'),
      quantity: z.number().finite().min(0).describe('Absolute physical quantity in the product unit of measure'),
    },
  }, async ({ productId, locationId, quantity }) => {
    try {
      const success = await useCases.executeUpdateStockQuantity(productId, locationId, quantity);
      if (!success) return toolError(new Error('Inventory adjustment failed. Inspect stock before retrying.'));
      return toolResult({ success, productId, locationId, quantity });
    } catch (error) { return toolError(error); }
  });
}
