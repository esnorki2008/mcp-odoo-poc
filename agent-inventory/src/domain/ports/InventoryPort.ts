import { Product, StockLevel } from '../entities/types';

export interface InventoryPort {
  /**
   * Search and retrieve products based on a query string matching name or default_code
   */
  searchProducts(query: string, limit?: number): Promise<Product[]>;

  /**
   * Get the current stock levels for a given product ID across storage locations
   */
  getStockLevels(productId: number): Promise<StockLevel[]>;

  /**
   * Update the stock level of a product at a specific location
   */
  updateStockQuantity(productId: number, locationId: number, quantity: number): Promise<boolean>;
}
