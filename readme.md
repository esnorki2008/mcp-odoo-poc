# Odoo MCP Agents

Monorepo con servidores MCP para Odoo orientados a inventario y reportería de ventas.

El proyecto expone herramientas MCP sobre Odoo usando XML-RPC y una arquitectura separada por dominios:

- `agent-server`: entry point principal y servidor MCP HTTP.
- `agent-core`: utilidades compartidas de configuración y transporte MCP.
- `agent-inventory`: herramientas de inventario.
- `agent-sales`: herramientas de ventas y reportería.

## Qué resuelve

Este repo permite conectar un cliente MCP a Odoo para consultar y operar sobre:

- búsqueda de productos
- niveles de stock
- actualización de cantidades de inventario
- ventas del mes, del año o por periodo
- mejores vendedores
- productos más vendidos
- línea de tiempo de ventas
- dashboard resumido de ventas

## Arquitectura

El flujo principal de llamadas es:

`MCP Client -> agent-server -> agent-core -> agent-inventory | agent-sales -> OdooXmlRpcAdapter -> Odoo XML-RPC`

### Endpoints

- `http://localhost:3000/inventory/mcp`
- `http://localhost:3000/sales/mcp`

### Paquetes

#### `agent-server`

- carga variables de entorno
- crea la conexión compartida a Odoo
- valida conectividad con `testOdooConnection()`
- monta los endpoints MCP por dominio

#### `agent-core`

- resuelve configuración desde variables de entorno
- crea el adaptador de Odoo
- monta endpoints MCP con `StreamableHTTPServerTransport`

#### `agent-inventory`

- compone el módulo de inventario
- registra tools MCP de inventario
- contiene casos de uso y acceso a productos / stock

Tools:

- `search_products`
- `get_stock_levels`
- `update_stock_quantity`

#### `agent-sales`

- compone el módulo de ventas
- registra tools MCP de reportería comercial
- contiene casos de uso agregados sobre `sale.order` y `sale.order.line`

Tools:

- `get_sales_summary`
- `get_top_salespeople`
- `get_top_selling_products`
- `get_sales_timeline`
- `get_sales_dashboard`

## Variables de entorno

Crea un archivo `.env` en la raíz del repo.

Ejemplo:

```env
ODOO_URL=http://localhost:8069
ODOO_DB=postgres
ODOO_USERNAME=odoo
ODOO_PASSWORD=odoo
PORT=3000
```

Hay un ejemplo base en [`.env.example`](/c:/Users/Nero/Pictures/TSK/poc/.env.example).

## Desarrollo

Instala dependencias en la raíz:

```bash
npm install
```

Levanta el servidor principal:

```bash
npm run dev:server
```

Build del monorepo:

```bash
npm run build
```

## Docker

El repo incluye un [`docker-compose.yaml`](/c:/Users/Nero/Pictures/TSK/poc/docker-compose.yaml) para levantar una instancia local de Odoo con Postgres.

Puertos relevantes:

- Odoo: `8069`
- Postgres: `5432`

## Seguridad

- El archivo `.env` está ignorado por Git.
- El repo publica solo `.env.example`.
- No se deben commitear credenciales reales de Odoo.

## Estado actual

La base del monorepo ya está preparada para seguir creciendo con más dominios MCP sobre Odoo, reutilizando el mismo patrón de composición por paquete.
