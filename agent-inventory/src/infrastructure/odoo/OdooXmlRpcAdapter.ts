import * as xmlrpc from 'xmlrpc';
import { InventoryPort } from '../../domain/ports/InventoryPort';
import { Product, StockLevel } from '../../domain/entities/types';

export class OdooXmlRpcAdapter implements InventoryPort {
  private url: string;
  private db: string;
  private username: string;
  private password: string;
  private uid: number | null = null;
  private authentication: Promise<number> | null = null;
  private commonClient: xmlrpc.Client;
  private objectClient: xmlrpc.Client;

  constructor(url: string, db: string, username: string, password: string, private readonly timeoutMs = 30000) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('timeoutMs must be positive');
    url = url.replace(/\/+$/, '');
    this.url = url;
    this.db = db;
    this.username = username;
    this.password = password;

    const commonUrl = `${url}/xmlrpc/2/common`;
    const objectUrl = `${url}/xmlrpc/2/object`;
    
    // Simplification for URL parsing to work with both http and https
    const commonOptions = this.parseUrl(commonUrl);
    const objectOptions = this.parseUrl(objectUrl);

    this.commonClient = commonOptions.isHttps 
      ? xmlrpc.createSecureClient(commonOptions) 
      : xmlrpc.createClient(commonOptions);
      
    this.objectClient = objectOptions.isHttps 
      ? xmlrpc.createSecureClient(objectOptions) 
      : xmlrpc.createClient(objectOptions);
  }

  private parseUrl(urlString: string) {
    const parsed = new URL(urlString);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname,
      isHttps: parsed.protocol === 'https:'
    };
  }

  private async rpc(client: xmlrpc.Client, method: string, params: any[]): Promise<any> {
    const controller = new AbortController();
    // Isolate mutable headers for concurrent XML-RPC requests.
    const options = { ...client.options, headers: { ...client.options.headers }, signal: controller.signal };
    const requestClient = client.isSecure ? xmlrpc.createSecureClient(options) : xmlrpc.createClient(options);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Odoo request timed out. For inventory writes, check current stock before retrying; the operation may have completed.'));
        controller.abort();
      }, this.timeoutMs);
      try {
        requestClient.methodCall(method, params, (error, value) => {
          clearTimeout(timer);
          if (error) {
            const message = error instanceof Error ? error.message : String(error);
            reject(new Error(this.password ? message.split(this.password).join('[redacted]') : message));
          } else resolve(value);
        });
      } catch (error) {
        clearTimeout(timer);
        reject(new Error('Could not serialize or send the Odoo request'));
      }
    });
  }

  private async authenticate(): Promise<number> {
    if (this.uid !== null) return this.uid;
    if (!this.authentication) {
      this.authentication = this.rpc(this.commonClient, 'authenticate', [this.db, this.username, this.password, {}])
        .then(value => {
          if (!Number.isInteger(value) || value <= 0) {
            throw new Error('Authentication failed: check ODOO_DB, ODOO_USERNAME and ODOO_PASSWORD');
          }
          this.uid = value;
          return value as number;
        })
        .finally(() => { this.authentication = null; });
    }
    return this.authentication;
  }

  public async testOdooConnection(): Promise<void> {
    await this.authenticate();
  }

  public async callKw(model: string, method: string, args: any[], kwargs: any = {}): Promise<any> {
    const uid = await this.authenticate();
    return this.rpc(this.objectClient, 'execute_kw', [this.db, uid, this.password, model, method, args, kwargs]);
  }

  public async searchRead<T = any>(
    model: string,
    domain: any[],
    options: { fields?: string[]; limit?: number; offset?: number; order?: string } = {}
  ): Promise<T[]> {
    return this.callKw(model, 'search_read', [domain], options) as Promise<T[]>;
  }

  public async readGroup<T = any>(
    model: string,
    domain: any[],
    fields: string[],
    groupBy: string[],
    options: Record<string, any> = {}
  ): Promise<T[]> {
    return this.callKw(model, 'read_group', [domain, fields, groupBy], options) as Promise<T[]>;
  }

  public async searchCount(model: string, domain: any[]): Promise<number> {
    return this.callKw(model, 'search_count', [domain]) as Promise<number>;
  }

  async searchProducts(query: string, limit: number = 10): Promise<Product[]> {
    const domain = [
      '|', 
      ['name', 'ilike', query], 
      ['default_code', 'ilike', query]
    ];
    
    const fields = ['id', 'name', 'default_code', 'list_price', 'qty_available', 'uom_name'];
    
    const products = await this.searchRead<Product>('product.product', domain, {
      fields: fields,
      order: 'id asc',
      limit: limit
    });
    
    return products as Product[];
  }

  async getStockLevels(productId: number): Promise<StockLevel[]> {
    const domain = [
      ['product_id', '=', productId],
      ['location_id.usage', '=', 'internal']
    ];
    
    const fields = ['id', 'product_id', 'location_id', 'quantity', 'reserved_quantity'];
    
    const levels = await this.searchRead<StockLevel>('stock.quant', domain, {
      fields: fields
    });
    
    return levels as StockLevel[];
  }

  async updateStockQuantity(productId: number, locationId: number, quantity: number): Promise<boolean> {
    // In Odoo, changing stock quantities is usually done via stock.quant
    // We can call the action_apply_inventory method if we create an inventory adjustment, 
    // or we can use the stock.quant create/write method if we are an admin.
    // For simplicity, we'll write directly to stock.quant or create it if not exists.
    
    const domain = [
      ['product_id', '=', productId],
      ['location_id', '=', locationId]
    ];
    
    const quants = await this.searchRead<{ id: number }>('stock.quant', domain, {
      fields: ['id']
    });

    if (quants.length > 1) {
      throw new Error('Multiple stock records match this product and location. Adjust the specific lot/package/owner in Odoo; no quantity was changed.');
    }
    if (quants.length > 0) {
      // Update existing quant
      const quantId = quants[0].id;
      await this.callKw('stock.quant', 'write', [[quantId], { inventory_quantity: quantity }]);
      await this.callKw('stock.quant', 'action_apply_inventory', [[quantId]]);
    } else {
      // Create new quant
      const newQuantId = await this.callKw('stock.quant', 'create', [{
        product_id: productId,
        location_id: locationId,
        inventory_quantity: quantity
      }]);
      await this.callKw('stock.quant', 'action_apply_inventory', [[newQuantId]]);
    }
    
    return true;
  }
}
