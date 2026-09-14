import { InventoryPort } from '../../domain/ports/InventoryPort';
import { Product, StockLevel } from '../../domain/entities/types';

export class InventoryUseCases {
  constructor(private readonly inventoryPort: InventoryPort) {}

  async executeSearchProducts(query: string, limit: number = 10): Promise<Product[]> {
    if (!query.trim()) {
      throw new Error("Search query cannot be empty");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('limit must be an integer between 1 and 100');
    return await this.inventoryPort.searchProducts(query.trim(), limit);
  }

  async executeGetStockLevels(productId: number): Promise<StockLevel[]> {
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new Error("Invalid product ID");
    }
    return await this.inventoryPort.getStockLevels(productId);
  }

  async executeUpdateStockQuantity(productId: number, locationId: number, quantity: number): Promise<boolean> {
    if (!Number.isInteger(productId) || !Number.isInteger(locationId) || productId <= 0 || locationId <= 0) {
      throw new Error("Invalid product ID or location ID");
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error("Quantity must be greater than or equal to 0");
    }
    return await this.inventoryPort.updateStockQuantity(productId, locationId, quantity);
  }
}
