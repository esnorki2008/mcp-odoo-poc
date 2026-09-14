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

Hay un ejemplo base en [`.env.example`](.env.example).

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

El repo incluye un [`docker-compose.yaml`](docker-compose.yaml) para levantar una instancia local de Odoo con Postgres.

Puertos relevantes:

- Odoo: `8069`
- Postgres: `5432`

## Seguridad

- El archivo `.env` está ignorado por Git.
- El repo publica solo `.env.example`.
- No se deben commitear credenciales reales de Odoo.

## Estado actual

La base del monorepo ya está preparada para seguir creciendo con más dominios MCP sobre Odoo, reutilizando el mismo patrón de composición por paquete.

## Uso desde agentes

La configuración de los dos endpoints está en [agent-server/mcp.json](agent-server/mcp.json).
El cliente debe soportar MCP Streamable HTTP: inicializar una sesión, conservar
`Mcp-Session-Id` y terminarla con DELETE. Cada sesión tiene su propia instancia MCP;
las credenciales y servicios de Odoo se comparten. Una sesión desconocida devuelve
404 y requiere una nueva inicialización.

Flujo de inventario:

1. `search_products({ "query": "referencia o nombre", "limit": 10 })`.
2. Usar el ID devuelto en `get_stock_levels({ "productId": 42 })`.
3. Para un ajuste solicitado, usar el ID de ubicación de `location_id[0]` en
   `update_stock_quantity({ "productId": 42, "locationId": 8, "quantity": 20 })`.
   La cantidad es absoluta, en la unidad del producto; no se suma al stock actual.

Para revisar todo el catálogo, usar el comodín de Odoo `%`, por ejemplo
`search_products({ "query": "%", "limit": 100 })`. No usar una cadena vacía ni
solo espacios: `query` se recorta y la herramienta la rechaza antes de consultar
Odoo. El resultado incluye `qty_available`; para confirmar el stock físico y las
reservas del producto encontrado, consultar después `get_stock_levels`.

Los IDs anteriores son ejemplos. Los límites aceptan enteros entre 1 y 100.
Una búsqueda que llena el límite devuelve `mayHaveMore: true`; se puede precisar
el nombre o referencia para reducir coincidencias. Los ajustes con varios registros
de stock para el mismo producto/ubicación se rechazan para evitar elegir un lote,
paquete o propietario arbitrariamente.

Para una vista general de ventas, usar `get_sales_dashboard({ "limit": 5 })`.
Para fechas específicas, indicar siempre `period: "custom"`, por ejemplo:

```json
{ "period": "custom", "startDate": "2026-09-01", "endDate": "2026-09-14" }
```

Las fechas incluyen ambos días y se interpretan en UTC. Los periodos month/year
son el mes/año calendario actual en UTC. Se rechazan fechas imposibles, rangos
invertidos y fechas suministradas sin `period: "custom"`. La línea de tiempo recorre
páginas de 1.000 pedidos sin truncar la primera página; omite días sin pedidos.
La paginación no constituye una instantánea transaccional si los pedidos cambian
mientras se consulta.

Los reportes incluyen pedidos confirmados y sus impuestos, no cotizaciones.
Los importes mantienen la moneda de los pedidos, sin conversión: requieren que
los pedidos visibles compartan moneda para interpretar correctamente los totales.

### Contrato de respuestas

Las herramientas devuelven JSON en `content[0].text` y el mismo objeto en
`structuredContent`. Los nombres de herramientas y argumentos se conservan, pero
el contenido antes era una lista/objeto directo y ahora lleva una clave descriptiva:

| Herramienta | Clave de datos |
| --- | --- |
| search_products | products, count, limit, mayHaveMore |
| get_stock_levels | productId, levels, count |
| update_stock_quantity | success, productId, locationId, quantity |
| get_sales_summary | summary |
| get_top_salespeople | salespeople |
| get_top_selling_products | products |
| get_sales_timeline | timeline |
| get_sales_dashboard | dashboard |

Los clientes que analizan el texto anterior deben adaptar la lectura a estas claves.
Las anotaciones MCP distinguen consultas de la herramienta de escritura.
Los errores de ejecución incluyen `isError: true` y `error.message`; los errores
de esquema los genera el SDK y pueden tener únicamente contenido de texto.

### Fiabilidad y pruebas

Las llamadas XML-RPC tienen un límite de 30 segundos por petición y comparten
la autenticación en curso cuando llegan simultáneamente. No se reintentan
escrituras automáticamente. Si falla un ajuste, inspeccionar el stock antes de
repetirlo: sus pasos de escritura y aplicación son peticiones separadas y pueden
haberse completado parcialmente. No se registran argumentos ni objetos HTTP de Odoo.

```bash
npm test
```

Este comando compila los cuatro paquetes y ejecuta pruebas de validación,
paginación, autenticación concurrente, timeout, contratos MCP y sesiones HTTP.
Las pruebas usan servidores locales simulados y no requieren credenciales.
La compatibilidad con la versión y los módulos de una instancia real de Odoo
debe verificarse en ese entorno.

Para integraciones que importan `mountMcpEndpoint` directamente, el tercer argumento
ahora es una fábrica `() => McpServer`, que crea un servidor por sesión.
