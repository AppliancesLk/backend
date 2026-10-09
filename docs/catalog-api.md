# Product catalog

The existing `/products` array response remains unchanged. The product listing uses public `GET /products/catalog` with validated query parameters:

| Parameter | Meaning |
| --- | --- |
| `q` | Literal case-insensitive search across name, SKU, brand, category; max 120 characters |
| `categoryId` | UUID; includes visible descendants |
| `brands` | Comma-separated brand names, case-insensitive OR, at most 20 |
| `minPrice`, `maxPrice` | Inclusive LKR bounds, up to two decimal places, 0–9999999999.99 |
| `sort` | `name` (default), `price-asc`, `price-desc`, `newest` |
| `page`, `limit` | Page starts at 1; default limit 12, maximum 48 |

Response: `{ items, total, page, limit, totalPages, facets }`. An excessive page is clamped to the last available page. Empty catalogs have page 1 and totalPages 0. Sorting uses product UUID as a stable tie breaker. Inactive products and categories, including inactive ancestors, are excluded from results and facets.

Facets contain categories (`categoryID`, `name`, `parentId`, descendant-inclusive `count`), brands (`name`, `count`), `allCount`, and global visible `price` bounds. Category counts respect search, price, and brand but exclude selected category. Brand counts respect search, price, and category but exclude selected brands. This allows customers to switch filters without losing alternatives.

Run migration `1792270000000-AddProductCatalogMetadata` using the existing TypeORM command. It adds optional `brand`, `subtitle`, `badge` (`NEW`, `HOT`, `DEAL`), `compareAtPrice`, and `createdAt`, plus filter indexes and database constraints. Existing products retain unknown (null) creation dates and have no invented brand or promotional data. Future products get a creation timestamp. Original price must exceed selling price; database constraints protect concurrent updates too.

Existing admin-only product create/update APIs accept these fields, and the existing frontend forms expose them. Send null to clear brand, badge, or original price; send an empty string to clear subtitle. Brand commas are reserved for filter separators. Public clients cannot edit product metadata. Product creation/update uses existing audit logs.

Reviews and sales popularity are outside this catalog change: the UI does not show fabricated stars or offer unsupported popularity sorting. The product hero uses real catalog imagery when available and a brand-colored treatment when none exists.

Verification: `npm run test:catalog:integration`; frontend `npm run test:catalog:e2e`. Tests create and clean up their own users, categories, and products.
