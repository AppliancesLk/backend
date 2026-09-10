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
- POST /categories: existing category creation endpoint.
- POST /products: existing creation endpoint extended with optional integer stockQty (default zero).
- PATCH /products/:id/stock: ADMIN only; body `{ "stockQty": 0 }`. Requires an integer between 0 and 2147483647; rejects extra fields.
- PATCH /products/:id and PATCH /categories/:id: existing activation/update endpoints.

Public product/category lists stay accessible without authentication. Inactive categories and their descendants are excluded publicly, along with products in those branches. Inactive products are excluded from public listings and detail reads. Admin catalog and inventory reads still include them.

Stock updates set the absolute available quantity. This task does not add stock movement history, orders or inventory reservation.

## Verification

- Backend: npm run test:admin:integration (temporary account/categories/products are removed in finally).
- Backend: npm run test:auth:integration; npm test -- --runInBand --testPathPatterns=auth; npm run lint.
- Frontend: npm run test:auth; npm run build; npm run lint.
