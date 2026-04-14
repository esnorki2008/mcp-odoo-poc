export interface Product {
  id: number;
  name: string;
  default_code?: string;
  list_price?: number;
  qty_available?: number;
  uom_name?: string;
}

export interface StockLevel {
  id: number;
  product_id: [number, string]; // [id, name] in Odoo usually
  location_id: [number, string]; // [id, name]
  quantity: number;
  reserved_quantity: number;
}
