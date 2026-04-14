import * as xmlrpc from 'xmlrpc';
import { InventoryPort } from '../../domain/ports/InventoryPort';
import { Product, StockLevel } from '../../domain/entities/types';

export class OdooXmlRpcAdapter implements InventoryPort {
  private url: string;
  private db: string;
  private username: string;
  private password: string;
  private uid: number | null = null;
  private commonClient: xmlrpc.Client;
  private objectClient: xmlrpc.Client;

  constructor(url: string, db: string, username: string, password: string) {
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

  private async authenticate(): Promise<number> {
    if (this.uid !== null) {
      return this.uid;
    }

    console.log('[Odoo] Authenticating', {
      url: this.url,
      db: this.db,
      username: this.username,
    });

    return new Promise((resolve, reject) => {
      this.commonClient.methodCall(
        'authenticate',
        [this.db, this.username, this.password, {}],
        (error, value) => {
          if (error) {
            console.error('[Odoo] Authentication error:', error);
            reject(error);
          } else if (!value) {
            reject(new Error('Authentication failed: Invalid credentials or database'));
          } else {
            this.uid = value as number;
            console.log('[Odoo] Authentication OK', { uid: this.uid });
            resolve(this.uid);
          }
        }
      );
    });
  }

  public async testOdooConnection(): Promise<void> {
    try {
      await this.authenticate();
      console.log(`[Odoo] Conexión y autenticación exitosa en la API de Odoo: ${this.url}`);
    } catch (error: any) {
      console.error(`[Odoo] Falla al conectar con la API de Odoo:`, error.message);
      throw error;
    }
  }

  public async callKw(model: string, method: string, args: any[], kwargs: any = {}): Promise<any> {
    const uid = await this.authenticate();
    console.log('[Odoo] execute_kw ->', {
      model,
      method,
      argsPreview: Array.isArray(args) ? JSON.stringify(args).slice(0, 300) : null,
      kwargs,
    });
    return new Promise((resolve, reject) => {
      this.objectClient.methodCall(
        'execute_kw',
        [this.db, uid, this.password, model, method, args, kwargs],
        (error, value) => {
          if (error) {
            console.error('[Odoo] execute_kw error ->', {
              model,
              method,
              error,
            });
            reject(error);
          } else {
            console.log('[Odoo] execute_kw OK ->', {
              model,
              method,
            });
            resolve(value);
          }
        }
      );
    });
  }

  public async searchRead<T = any>(
    model: string,
    domain: any[],
    options: { fields?: string[]; limit?: number; order?: string } = {}
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

    if (quants && quants.length > 0) {
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
