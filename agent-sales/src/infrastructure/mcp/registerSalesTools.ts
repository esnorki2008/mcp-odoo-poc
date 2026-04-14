// @ts-nocheck
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SalesUseCases } from '../../application/use-cases/SalesUseCases';

const periodPresetSchema = z.enum(['month', 'year', 'custom']).optional().default('month');

export function registerSalesTools(server: McpServer, useCases: SalesUseCases) {
  server.registerTool(
    'get_sales_summary',
    {
      description: 'Get total sales, order count, and average ticket for the current month, current year, or a custom period in Odoo Sales.',
      inputSchema: {
        period: periodPresetSchema.describe('month, year, or custom'),
        startDate: z.string().optional().describe('Required for custom period. Format: YYYY-MM-DD'),
        endDate: z.string().optional().describe('Required for custom period. Format: YYYY-MM-DD'),
      }
    },
    async (args) => {
      try {
        console.log('[Tool] get_sales_summary input:', args);
        const summary = await useCases.executeGetSalesSummary(args.period, args.startDate, args.endDate);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }]
        };
      } catch (error: any) {
        console.error('[Tool] get_sales_summary error:', error);
        return {
          content: [{ type: 'text' as const, text: `Error getting sales summary: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'get_top_salespeople',
    {
      description: 'Get the top salespeople by revenue for the current month, current year, or a custom period.',
      inputSchema: {
        limit: z.number().optional().default(5).describe('Maximum number of salespeople to return'),
        period: periodPresetSchema.describe('month, year, or custom'),
        startDate: z.string().optional().describe('Required for custom period. Format: YYYY-MM-DD'),
        endDate: z.string().optional().describe('Required for custom period. Format: YYYY-MM-DD'),
      }
    },
    async (args) => {
      try {
        console.log('[Tool] get_top_salespeople input:', args);
        const sellers = await useCases.executeGetTopSalespeople(args.limit, args.period, args.startDate, args.endDate);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(sellers, null, 2) }]
        };
      } catch (error: any) {
        console.error('[Tool] get_top_salespeople error:', error);
        return {
          content: [{ type: 'text' as const, text: `Error getting top salespeople: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'get_top_selling_products',
    {
      description: 'Get the best-selling products by revenue and quantity in Odoo Sales.',
      inputSchema: {
        limit: z.number().optional().default(5).describe('Maximum number of products to return'),
        period: periodPresetSchema.describe('month, year, or custom'),
        startDate: z.string().optional().describe('Required for custom period. Format: YYYY-MM-DD'),
        endDate: z.string().optional().describe('Required for custom period. Format: YYYY-MM-DD'),
      }
    },
    async (args) => {
      try {
        console.log('[Tool] get_top_selling_products input:', args);
        const products = await useCases.executeGetTopProducts(args.limit, args.period, args.startDate, args.endDate);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(products, null, 2) }]
        };
      } catch (error: any) {
        console.error('[Tool] get_top_selling_products error:', error);
        return {
          content: [{ type: 'text' as const, text: `Error getting top selling products: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'get_sales_timeline',
    {
      description: 'Get a sales timeline grouped by day or month for the selected period.',
      inputSchema: {
        period: periodPresetSchema.describe('month, year, or custom'),
        startDate: z.string().optional().describe('Required for custom period. Format: YYYY-MM-DD'),
        endDate: z.string().optional().describe('Required for custom period. Format: YYYY-MM-DD'),
        granularity: z.enum(['day', 'month']).optional().describe('Defaults to day for month and month for year'),
      }
    },
    async (args) => {
      try {
        console.log('[Tool] get_sales_timeline input:', args);
        const timeline = await useCases.executeGetSalesTimeline(args.period, args.startDate, args.endDate, args.granularity);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(timeline, null, 2) }]
        };
      } catch (error: any) {
        console.error('[Tool] get_sales_timeline error:', error);
        return {
          content: [{ type: 'text' as const, text: `Error getting sales timeline: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'get_sales_dashboard',
    {
      description: 'Get a compact sales dashboard including month/year summary, top salespeople, and top products.',
      inputSchema: {
        limit: z.number().optional().default(5).describe('Maximum number of top entries to return'),
      }
    },
    async (args) => {
      try {
        console.log('[Tool] get_sales_dashboard input:', args);
        const dashboard = await useCases.executeGetSalesDashboard(args.limit);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(dashboard, null, 2) }]
        };
      } catch (error: any) {
        console.error('[Tool] get_sales_dashboard error:', error);
        return {
          content: [{ type: 'text' as const, text: `Error getting sales dashboard: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
