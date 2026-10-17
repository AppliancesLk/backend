# Admin catalog and inventory

## Local account setup

Apply the existing schema migrations first when setting up a fresh database. Run `npm run seed:admin` from backend. It creates or updates username `admin`, email `admin@appliances.local`, role ADMIN, and a bcrypt hash for the requested local password `12345678`. Set SEED_ADMIN_PASSWORD to use another password. Re-running the command updates this account and revokes its existing sessions. It does not create duplicate accounts or delete catalog data.

No schema migration is needed for this task: users already have username/role/passwordHash, and products already have stockQty. Credentials are provisioned by the explicit seed command, rather than committed as a password-setting schema migration.

Sign in through /login. Admin users land on /admin (or their originally requested admin route); customers land on /account and repairers on /repairer. The frontend derives the destination from the returned user, and all management APIs enforce ADMIN on the server.

## Admin pages

- /admin: live product/category counts, stock totals and out-of-stock counts.
- /admin/categories: create top-level categories or subcategories, view categories and activate/deactivate them.
- /admin/products: create products with name, SKU, LKR price, category, initial stock, image URLs and specifications; search the catalog and activate/deactivate products.
- /admin/inventory: view every product and set its available stock quantity, with per-row validation and feedback.

The existing shared services and cookie-enabled API client handle backend calls. Page-specific state is kept in local hooks; new management views follow the blue/slate design, translations, constants and customer/admin separation in AGENTS.md.

## API contracts

- GET /products/admin/all and GET /categories/admin/all: authenticated ADMIN catalog lists including inactive entries.
- GET /products/admin/:id: authenticated ADMIN detail read, including inactive products and products in inactive category branches. Invalid UUIDs return 400 and missing products return 404.
- POST /categories: existing category creation endpoint.
- POST /products: existing creation endpoint extended with optional integer stockQty (default zero).
- PATCH /products/:id/stock: ADMIN only; body `{ "stockQty": 0 }`. Requires an integer between 0 and 2147483647; rejects extra fields.
- PATCH /products/:id and PATCH /categories/:id: existing activation/update endpoints.

Public product/category lists stay accessible without authentication. Inactive categories and their descendants are excluded publicly, along with products in those branches. Inactive products are excluded from public listings and detail reads. Admin catalog and inventory reads still include them.

Stock updates set the absolute available quantity. This task does not add stock movement history, orders or inventory reservation.

## Product editing contract

`PATCH /products/:id` requires a valid cookie session, ADMIN role, the trusted browser origin and the existing X-Requested-With header. It returns 200 with the full updated product and its category; decimal prices may be serialized as strings, matching existing read responses.

Supported optional fields:

| Field | Validation / clearing behavior |
| --- | --- |
| name | Non-empty string after trimming; null is rejected. |
| SKU | Non-empty string after trimming; must remain unique; null is rejected. |
| price | Number from 0 through 9999999999.99, with at most two decimal places; numeric strings and null are rejected. |
| categoryID | Existing category UUID, including inactive categories for admin management; null is rejected. |
| images | Array of strings; `[]` removes all images; null is rejected. |
| specifications | JSON object, including nested values; `null` clears to SQL NULL and `{}` replaces with an empty object. |
| isActive | Boolean; false is valid, null is rejected. |

Omitted fields retain their existing values. An empty object is a successful no-op for an existing product. A supplied specifications object replaces the entire specifications object; it is not recursively merged. Stock is not accepted by this endpoint; use PATCH /products/:id/stock. Unknown fields are rejected by the existing global validation pipe.

Example:

```json
{
  "name": "Updated washing machine",
  "price": 149990.50,
  "images": [],
  "specifications": {
    "Capacity": "9 kg",
    "Programs": ["Cotton", "Wool"],
    "Smart": false
  }
}
```

The editor should use GET /products/admin/:id to load the initial record rather than the public detail endpoint, which deliberately hides unavailable products.

Expected errors: 400 invalid input/UUID, 401 missing or expired session, 403 insufficient role or failed browser-origin checks, 404 missing product/category, and 409 duplicate SKU. PostgreSQL SKU uniqueness violations are translated to 409 even if concurrent requests pass the initial availability check. Other persistence failures retain normal server error handling with safe operation/resource logs.

Detail updates persist only supplied product fields rather than saving the earlier full entity, avoiding accidental writes to stock and other omitted fields. The update response reloads the complete product after saving. No schema migration is required; all edited fields already exist.

## Verification

- Backend: npm run test:admin:integration (temporary account/categories/products are removed in finally).
- Backend: npm test -- --runInBand --testPathPatterns=products.service.
- Backend: npm run test:auth:integration; npm test -- --runInBand --testPathPatterns=auth; npm run lint.
- Frontend: npm run test:auth; npm run build; npm run lint.
