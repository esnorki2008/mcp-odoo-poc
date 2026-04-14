export interface SalesDateRange {
  start: string;
  end: string;
  label: string;
}

export interface SalesSummary {
  period: SalesDateRange;
  totalAmount: number;
  orderCount: number;
  averageOrderValue: number;
}

export interface TopSalesperson {
  id: number | null;
  name: string;
  totalAmount: number;
  orderCount: number;
}

export interface TopProduct {
  id: number | null;
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface SalesTimelinePoint {
  label: string;
  totalAmount: number;
  orderCount: number;
}

export interface SalesDashboard {
  month: SalesSummary;
  year: SalesSummary;
  topSalespeople: TopSalesperson[];
  topProducts: TopProduct[];
}
