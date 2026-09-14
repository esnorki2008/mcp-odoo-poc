import { z } from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolResult, toolError } from 'agent-inventory';
import { SalesUseCases } from '../../application/use-cases/SalesUseCases';

const periodFields = {
  period: z.enum(['month', 'year', 'custom']).default('month').describe('Current calendar month/year in UTC, or custom dates'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Inclusive YYYY-MM-DD; required only with period=custom'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Inclusive YYYY-MM-DD; required only with period=custom'),
};
const limit = z.number().int().min(1).max(100).default(5).describe('Maximum ranked entries, 1–100');
const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const scope = ' Includes confirmed sales orders (sale/done), with taxes; excludes quotations. Amounts are not currency-converted: use only when the visible orders share a currency. Dates are UTC.';

export function registerSalesTools(server: McpServer, useCases: SalesUseCases) {
  server.registerTool('get_sales_summary', {
    description: 'Total sales, order count and average order value for the selected period.' + scope,
    annotations, inputSchema: periodFields,
  }, async ({ period, startDate, endDate }) => {
    try { return toolResult({ summary: await useCases.executeGetSalesSummary(period, startDate, endDate) }); }
    catch (error) { return toolError(error); }
  });
  server.registerTool('get_top_salespeople', {
    description: 'Rank salespeople by sales amount descending for the selected period.' + scope,
    annotations, inputSchema: { ...periodFields, limit },
  }, async ({ limit, period, startDate, endDate }) => {
    try { return toolResult({ salespeople: await useCases.executeGetTopSalespeople(limit, period, startDate, endDate) }); }
    catch (error) { return toolError(error); }
  });
  server.registerTool('get_top_selling_products', {
    description: 'Rank products by sales amount descending; includes quantities ordered, not delivered.' + scope,
    annotations, inputSchema: { ...periodFields, limit },
  }, async ({ limit, period, startDate, endDate }) => {
    try { return toolResult({ products: await useCases.executeGetTopProducts(limit, period, startDate, endDate) }); }
    catch (error) { return toolError(error); }
  });
  server.registerTool('get_sales_timeline', {
    description: 'Sales totals and order counts grouped by day or month. Empty buckets are omitted.' + scope,
    annotations, inputSchema: {
      ...periodFields,
      granularity: z.enum(['day', 'month']).optional().describe('Defaults to month for year, day otherwise'),
    },
  }, async ({ period, startDate, endDate, granularity }) => {
    try { return toolResult({ timeline: await useCases.executeGetSalesTimeline(period, startDate, endDate, granularity) }); }
    catch (error) { return toolError(error); }
  });
  server.registerTool('get_sales_dashboard', {
    description: 'Start here for an overview: current month/year summaries and current-month top salespeople and products in one call.' + scope,
    annotations, inputSchema: { limit },
  }, async ({ limit }) => {
    try { return toolResult({ dashboard: await useCases.executeGetSalesDashboard(limit) }); }
    catch (error) { return toolError(error); }
  });
}
