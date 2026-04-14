// @ts-nocheck
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InventoryUseCases } from '../../application/use-cases/InventoryUseCases';

export function registerInventoryTools(server: McpServer, useCases: InventoryUseCases) {
  server.registerTool(
    'search_products',
    {
      description: 'Search for products in Odoo Inventory by name or code',
      inputSchema: {
        query: z.string().describe('Search term for product name or default_code'),
        limit: z.number().optional().default(10).describe('Maximum number of products to return'),
      }
    },
    async (args) => {
      try {
        console.log('[Tool] search_products input:', args);
        const products = await useCases.executeSearchProducts(args.query, args.limit);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(products, null, 2) }]
        };
      } catch (error: any) {
        console.error('[Tool] search_products error:', error);
        return {
          content: [{ type: 'text' as const, text: `Error searching products: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'get_stock_levels',
    {
      description: 'Get stock levels (quantities across storage locations) for a specific Odoo product by ID',
      inputSchema: {
        productId: z.number().describe('The numeric ID of the product'),
      }
    },
    async (args) => {
      try {
        console.log('[Tool] get_stock_levels input:', args);
        const levels = await useCases.executeGetStockLevels(args.productId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(levels, null, 2) }]
        };
      } catch (error: any) {
        console.error('[Tool] get_stock_levels error:', error);
        return {
          content: [{ type: 'text' as const, text: `Error getting stock levels: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'update_stock_quantity',
    {
      description: 'Update or set the inventory quantity of a product at a specific location',
      inputSchema: {
        productId: z.number().describe('The numeric ID of the product'),
        locationId: z.number().describe('The numeric ID of the storage location'),
        quantity: z.number().describe('The new absolute quantity to set'),
      }
    },
    async (args) => {
      try {
        console.log('[Tool] update_stock_quantity input:', args);
        const success = await useCases.executeUpdateStockQuantity(args.productId, args.locationId, args.quantity);
        return {
          content: [{ type: 'text' as const, text: success ? 'Stock quantity updated successfully' : 'Failed to update stock quantity' }]
        };
      } catch (error: any) {
        console.error('[Tool] update_stock_quantity error:', error);
        return {
          content: [{ type: 'text' as const, text: `Error updating stock quantity: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
