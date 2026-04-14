import { OdooXmlRpcAdapter } from 'agent-inventory';
import {
  SalesDashboard,
  SalesDateRange,
  SalesSummary,
  SalesTimelinePoint,
  TopProduct,
  TopSalesperson
} from '../../domain/entities/types';

type PeriodPreset = 'month' | 'year' | 'custom';
type TimelineGranularity = 'day' | 'month';

interface GroupRow {
  [key: string]: any;
  __count?: number;
  amount_total?: number;
  price_total?: number;
  product_uom_qty?: number;
}

interface SaleOrderRow {
  amount_total?: number;
  date_order?: string;
}

export class SalesUseCases {
  constructor(private readonly odoo: OdooXmlRpcAdapter) {}

  async executeGetSalesSummary(
    preset: PeriodPreset = 'month',
    startDate?: string,
    endDate?: string
  ): Promise<SalesSummary> {
    const range = this.resolveRange(preset, startDate, endDate);
    const domain = this.buildSalesOrderDomain(range);
    const grouped = await this.odoo.readGroup<GroupRow>(
      'sale.order',
      domain,
      ['amount_total:sum'],
      [],
      { lazy: false }
    );
    const orderCount = await this.odoo.searchCount('sale.order', domain);
    const totalAmount = grouped[0]?.amount_total ?? 0;

    return {
      period: range,
      totalAmount,
      orderCount,
      averageOrderValue: orderCount > 0 ? totalAmount / orderCount : 0,
    };
  }

  async executeGetTopSalespeople(
    limit = 5,
    preset: PeriodPreset = 'month',
    startDate?: string,
    endDate?: string
  ): Promise<TopSalesperson[]> {
    const range = this.resolveRange(preset, startDate, endDate);
    const rows = await this.odoo.readGroup<GroupRow>(
      'sale.order',
      this.buildSalesOrderDomain(range),
      ['user_id', 'amount_total:sum'],
      ['user_id'],
      { lazy: false }
    );

    return rows
      .map((row) => ({
        id: Array.isArray(row.user_id) ? row.user_id[0] : null,
        name: Array.isArray(row.user_id) ? row.user_id[1] : 'Sin vendedor',
        totalAmount: row.amount_total ?? 0,
        orderCount: row.__count ?? 0,
      }))
      .sort((left, right) => right.totalAmount - left.totalAmount)
      .slice(0, limit);
  }

  async executeGetTopProducts(
    limit = 5,
    preset: PeriodPreset = 'month',
    startDate?: string,
    endDate?: string
  ): Promise<TopProduct[]> {
    const range = this.resolveRange(preset, startDate, endDate);
    const rows = await this.odoo.readGroup<GroupRow>(
      'sale.order.line',
      this.buildSalesOrderLineDomain(range),
      ['product_id', 'product_uom_qty:sum', 'price_total:sum'],
      ['product_id'],
      { lazy: false }
    );

    return rows
      .map((row) => ({
        id: Array.isArray(row.product_id) ? row.product_id[0] : null,
        name: Array.isArray(row.product_id) ? row.product_id[1] : 'Sin producto',
        quantitySold: row.product_uom_qty ?? 0,
        revenue: row.price_total ?? 0,
      }))
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, limit);
  }

  async executeGetSalesTimeline(
    preset: PeriodPreset = 'month',
    startDate?: string,
    endDate?: string,
    granularity?: TimelineGranularity
  ): Promise<SalesTimelinePoint[]> {
    const range = this.resolveRange(preset, startDate, endDate);
    const rows = await this.odoo.searchRead<SaleOrderRow>(
      'sale.order',
      this.buildSalesOrderDomain(range),
      {
        fields: ['date_order', 'amount_total'],
        limit: 1000,
        order: 'date_order asc',
      }
    );

    const effectiveGranularity = granularity ?? (preset === 'year' ? 'month' : 'day');
    const buckets = new Map<string, SalesTimelinePoint>();

    for (const row of rows) {
      const label = this.formatBucketLabel(row.date_order, effectiveGranularity);
      const current = buckets.get(label) ?? { label, totalAmount: 0, orderCount: 0 };
      current.totalAmount += row.amount_total ?? 0;
      current.orderCount += 1;
      buckets.set(label, current);
    }

    return Array.from(buckets.values());
  }

  async executeGetSalesDashboard(limit = 5): Promise<SalesDashboard> {
    const [month, year, topSalespeople, topProducts] = await Promise.all([
      this.executeGetSalesSummary('month'),
      this.executeGetSalesSummary('year'),
      this.executeGetTopSalespeople(limit, 'month'),
      this.executeGetTopProducts(limit, 'month'),
    ]);

    return {
      month,
      year,
      topSalespeople,
      topProducts,
    };
  }

  private buildSalesOrderDomain(range: SalesDateRange): any[] {
    return [
      ['state', 'in', ['sale', 'done']],
      ['date_order', '>=', range.start],
      ['date_order', '<=', range.end],
    ];
  }

  private buildSalesOrderLineDomain(range: SalesDateRange): any[] {
    return [
      ['order_id.state', 'in', ['sale', 'done']],
      ['order_id.date_order', '>=', range.start],
      ['order_id.date_order', '<=', range.end],
      ['display_type', '=', false],
    ];
  }

  private resolveRange(preset: PeriodPreset, startDate?: string, endDate?: string): SalesDateRange {
    if (preset === 'custom') {
      if (!startDate || !endDate) {
        throw new Error('startDate and endDate are required when preset is custom');
      }

      return {
        start: `${startDate} 00:00:00`,
        end: `${endDate} 23:59:59`,
        label: `${startDate} -> ${endDate}`,
      };
    }

    const now = new Date();

    if (preset === 'month') {
      const year = now.getFullYear();
      const month = now.getMonth();
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0);

      return {
        start: this.toOdooDateTime(start, false),
        end: this.toOdooDateTime(end, true),
        label: `${year}-${String(month + 1).padStart(2, '0')}`,
      };
    }

    const year = now.getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);

    return {
      start: this.toOdooDateTime(start, false),
      end: this.toOdooDateTime(end, true),
      label: `${year}`,
    };
  }

  private toOdooDateTime(date: Date, endOfDay: boolean): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = endOfDay ? '23:59:59' : '00:00:00';

    return `${year}-${month}-${day} ${time}`;
  }

  private formatBucketLabel(value: string | undefined, granularity: TimelineGranularity): string {
    if (!value) {
      return 'Sin fecha';
    }

    const date = new Date(value.replace(' ', 'T'));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return granularity === 'month' ? `${year}-${month}` : `${year}-${month}-${day}`;
  }
}
