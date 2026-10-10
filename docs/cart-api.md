# Stage 2 Cart API

Cart endpoints are for authenticated `CUSTOMER` accounts only. The controller
uses the existing `JwtAuthGuard` and `RolesGuard`. Despite its historical name,
this guard authenticates the existing opaque `appliances_session` cookie; Cart
does not introduce a separate JWT authentication mechanism. Customer identity
comes exclusively from the guard-populated `request.user.sub`.

Browser requests must include credentials. Mutations also require the existing
`X-Requested-With: XMLHttpRequest` header and the allowed frontend Origin.
Do not send `userId`, `cartId`, product prices, or totals in request bodies;
unrecognized fields are rejected by the global validation pipe.

| Method | Endpoint              | Body                                       | Success           |
| ------ | --------------------- | ------------------------------------------ | ----------------- |
| GET    | `/cart`               | None                                       | 200, current cart |
| POST   | `/cart/items`         | `{ "productId": "<uuid>", "quantity": 2 }` | 201, current cart |
| PATCH  | `/cart/items/:itemId` | `{ "quantity": 3 }`                        | 200, current cart |
| DELETE | `/cart/items/:itemId` | None                                       | 200, current cart |
| DELETE | `/cart`               | None                                       | 200, empty cart   |

POST adds to the existing quantity when the product is already in the cart.
PATCH replaces that item's quantity. Quantity must be a JSON integer between
1 and 2147483647; zero does not remove an item. Both operations validate the
resulting quantity against current product stock. Inactive products, and products
in hidden categories, cannot be added or updated. No cart operation reserves or
reduces inventory.

GET on an unused cart returns `id: null` and an empty items array without writing
to the database. The cart is persisted lazily on its first successful mutation.
One unique customer constraint and one unique cart/product constraint prevent
duplicates. Transactions lock the customer's cart before changing its items,
including during concurrent first use. Every item lookup is scoped to that cart.

All successes return the same shape:

```json
{
  "id": "<cart-uuid-or-null>",
  "currency": "LKR",
  "items": [
    {
      "id": "<item-uuid>",
      "productId": "<product-uuid>",
      "name": "Example appliance",
      "SKU": "EXAMPLE-1",
      "images": [],
      "quantity": 2,
      "stockQty": 7,
      "isAvailable": true,
      "unitPrice": "1234.50",
      "lineTotal": "2469.00"
    }
  ],
  "itemCount": 1,
  "subtotal": "2469.00"
}
```

`itemCount` counts distinct products. Money values are fixed two-decimal strings,
computed with integer minor units from current backend product prices, with no
floating-point rounding. Prices are not frozen at add time. Subtotal includes
all persisted items; an item that becomes inactive, hidden, or understocked remains
in its owner's response with `isAvailable: false` and can still be removed or
cleared. A later checkout implementation must revalidate price and stock. Hard
product deletion cascades its cart items; customer deletion cascades the cart.

Errors use the existing Nest response format:

- 400: invalid quantity/UUID, unexpected body fields, or insufficient current stock.
- 401: absent, invalid, expired, or revoked authentication cookie.
- 403: authenticated role other than CUSTOMER, or existing browser-security policy failure.
- 404: unknown/unavailable product; unknown item or an item belonging to another customer.

Important successful mutations and service failures use safe structured logs.
Logs contain operation, customer/cart identifiers where available, outcome, and
safe failure classification/status; raw errors, bodies, cookies, and credentials
are not logged.

## Migration and verification

From `backend`:

```sh
npm run migration:run -- -d src/database/data-source.ts
npm run build
npm run lint
npm run test -- --runInBand src/cart/services/cart.service.spec.ts src/products/services/products.service.spec.ts src/auth/services/auth.service.spec.ts
npm run test:cart:integration
```

`CreateCartsAndCartItems1792220000000` adds `carts` and `cart_items` with UUID
keys, foreign keys, unique ownership/product constraints, and a positive quantity
check. Synchronization remains disabled. Its down migration drops only these two
tables and their contents; use normal migration review before reverting real data.

The integration test uses temporary customer/admin/repairer accounts and catalog
fixtures in the configured development database, then deletes only those fixtures.
It exercises concurrent additions, cross-customer isolation, exact large totals,
price/stock changes, validation, authentication/RBAC, and inventory preservation.
Migration up/down/reapply and database constraints are verified in a temporary
schema inside a rolled-back transaction, without dropping application tables.
