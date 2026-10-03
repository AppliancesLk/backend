# Customer Orders API

Orders are created and retrieved only by their authenticated CUSTOMER owner.
The module reuses existing cookie sessions through JwtAuthGuard/RolesGuard;
there is no second authentication system. Identity comes from request.user.sub,
never from a posted customerId/userId.

## Create an order

`POST /orders` returns HTTP 201 with the persisted order. Include the existing
session cookie, browser credentials, allowed Origin, and
`X-Requested-With: XMLHttpRequest` header.

```json
{
  "idempotencyKey": "<new-uuid-for-this-purchase-flow>",
  "delivery": {
    "firstName": "Test",
    "lastName": "Customer",
    "email": "customer@example.com",
    "phone": "0771234567",
    "addressLine1": "123 Example Road",
    "addressLine2": "Unit 2",
    "city": "Colombo",
    "postalCode": "00100",
    "countryCode": "LK"
  }
}
```

Delivery fields use the existing Checkout DTO validation and normalization.
Only addressLine2 is optional. Unknown root/nested fields are rejected, including
customer identity, cart IDs, item lists, status, prices, totals, and client-posted
checkout summaries. A separate client quote is not accepted as proof of validity.

The backend runs Checkout validation again inside the order transaction. Thus
creating an order can fail after a previously successful checkout if products,
stock, categories, or the cart changed. Prices are read again from the current
backend catalog; old frontend/checkout prices never override them. Checkout's
item response now additionally exposes current product images for snapshots.

### Atomic conversion and retry rules

1. Look for an existing order using the authenticated customer and idempotency key.
2. If found, verify the normalized delivery fingerprint and return that order.
3. Otherwise lock the current customer's cart against competing Cart/order writes.
4. Run Checkout again using the same REPEATABLE READ transaction/connection.
5. Save the order, delivery snapshot, and every purchase-time item snapshot.
6. Consume the source cart items and commit all changes together.

Failures roll back the entire operation, including cart consumption. A unique
customer/key constraint handles duplicate requests. Concurrent requests with
different keys also cannot convert the same live cart contents twice. Snapshot
conflicts are resolved with a fresh idempotency lookup or returned as HTTP 409.

Generate one UUID per intended purchase flow and reuse it with the same delivery
information for repeated clicks, retries, or an unknown network outcome. A retry
returns the same order with HTTP 201 even after its source cart was consumed,
product details changed, or new items were added to the cart. It does not consume
the customer's next cart. Reusing a key with changed delivery details returns 409.
Keys are scoped to customers; another customer's matching key reveals nothing.
Start a genuinely new purchase flow with a new UUID.

The cart is cleared only on successful conversion. Product stock is not reserved
or deducted: this foundation creates an **unpaid PENDING_PAYMENT** order. A later
payment flow must revalidate inventory and perform any reservation/deduction
atomically under the agreed payment policy. This is not a payment confirmation
or a promise of reserved stock.

## Order response and snapshots

```json
{
  "id": "<order-uuid>",
  "customerId": "<authenticated-customer-uuid>",
  "sourceCartId": "<historical-cart-uuid>",
  "status": "PENDING_PAYMENT",
  "currency": "LKR",
  "delivery": { "...": "validated delivery fields" },
  "subtotal": "2469.00",
  "total": "2469.00",
  "preparedAt": "2026-10-17T10:00:00.000Z",
  "createdAt": "2026-10-17T10:00:00.000Z",
  "updatedAt": "2026-10-17T10:00:00.000Z",
  "items": [
    {
      "id": "<order-item-uuid>",
      "productId": "<product-uuid>",
      "name": "Purchase-time product name",
      "SKU": "PURCHASE-SKU",
      "images": ["https://example.com/original.jpg"],
      "quantity": 2,
      "unitPrice": "1234.50",
      "lineTotal": "2469.00"
    }
  ]
}
```

Names, SKU, image URLs, quantities, unit prices, and line totals are stored
snapshots. Later catalog edits or deactivation cannot rewrite order history.
Images store their purchase-time URLs, not copies of external image files.
Product/customer foreign keys use RESTRICT so hard deletion cannot break the
permanent reference/history. Existing deactivation remains available.
Order deletion cascades its own items; no deletion endpoint is introduced.
sourceCartId is a historical UUID rather than a live cart foreign key.

Monetary values remain exact decimal strings. Unit prices use numeric(12,2), and
line/header totals use numeric(30,2) to preserve large bigint-calculated amounts.
Current totals are Checkout's trusted subtotal/total with no new fees, discounts,
taxes, or loyalty policy. Idempotency keys and delivery fingerprints are hidden
from normal ORM selection and all API responses. Logs contain safe operation,
resource IDs, outcome, and HTTP status only; they never include delivery data,
credentials, keys, hashes, or raw database errors. Unexpected creation failures
are translated to a safe generic 500 before Nest's default logging handler.

## Read one owned order

`GET /orders/:id` returns HTTP 200 with the same saved response. Authentication
and CUSTOMER role are required. Both unknown IDs and another customer's order
return 404. Invalid UUIDs return 400. The response includes all stored OrderItems, quantities,
purchase-time decimal prices, totals, delivery information and current status.

## List owned orders

`GET /orders` returns HTTP 200 with an array of the order response above (or `[]`
when there are no orders). Authentication and CUSTOMER role are required. No body
or query parameters are required. Identity is taken only from the authenticated
session; customer IDs supplied in a query cannot change the owner scope.
Orders are sorted by createdAt descending, then ID descending for stable ties.
Each order includes its stored item snapshots; current product data is not joined.
This initial list is unpaginated, consistent with the existing stage-one APIs.

## Read current status

`GET /orders/:id/status` requires authentication and CUSTOMER role and returns 200:

```json
{
  "id": "<order-uuid>",
  "status": "PENDING_PAYMENT",
  "updatedAt": "2026-10-17T10:00:00.000Z"
}
```

No body or query parameters are required. Status is read from the stored order on
every request without loading items or delivery data. Unknown and unowned UUIDs
both return the same 404 `Order not found`; malformed UUIDs return 400. Missing,
invalid or revoked sessions return 401; other authenticated roles return 403.
All read endpoints use the existing JwtAuthGuard and session-cookie authentication.
Unexpected retrieval failures log only operation/resource IDs and a safe status,
and return a generic 500 without raw database errors or delivery data.

Admin order management uses ADMIN-only `GET /admin/orders`,
`GET /admin/orders/:id`, and `PATCH /admin/orders/:id/status`. Responses include
the customer username/email and the related payment summary when one exists.
Lists are newest first. No schema migration is required.

## Shared order status

The PostgreSQL/TypeScript enum provides PENDING_PAYMENT (creation default),
CONFIRMED, PROCESSING, SHIPPED, DELIVERED, and CANCELLED. Read APIs return these same canonical values. Only creation/default
Payment verification owns the PENDING_PAYMENT to CONFIRMED transition. Admins can
move CONFIRMED to PROCESSING, PROCESSING to SHIPPED, and SHIPPED to DELIVERED.
Eligible pending, confirmed, or processing orders may be cancelled. Backward,
terminal, arbitrary, and payment-bypassing transitions return 409; enum values
outside the shared status structure return 400.

## HTTP failures

- 400: invalid UUID/key/delivery/body or empty cart.
- 401: missing, invalid, expired/revoked session, or inactive user.
- 403: non-CUSTOMER role or the existing browser-security policy.
- 404: unknown/unowned order or missing cart product detected during validation.
- 409: changed/unavailable product or stock, concurrent cart change, or conflicting key reuse.
- 500: unexpected write failure; response contains no raw SQL or personal data.

## Migration and checks

`CreateOrdersAndOrderItems1792230000000` creates the order status enum, orders,
order_items, foreign keys, uniqueness constraints, quantity/money checks, and
lookup indexes. Synchronization remains disabled.

```sh
npm run migration:run -- -d src/database/data-source.ts
npm run build
npm run lint
npm run test -- --runInBand src/orders/services/orders.service.spec.ts src/checkout/services/checkout.service.spec.ts src/cart/services/cart.service.spec.ts src/products/services/products.service.spec.ts src/auth/services/auth.service.spec.ts
npm run test:orders:integration
npm run test:cart:integration
npm run test:checkout:integration
npm run test:auth:integration
npm run test:admin:integration
```

Real PostgreSQL tests create isolated temporary accounts/catalog fixtures and
remove only those records, deleting their orders first to respect history FKs.
They cover current price/stock/activity revalidation, stored snapshots, tenant
isolation, same-key/different-key concurrency, repeat requests with refilled
carts, exact large totals, and actual transaction rollback after item insert or
cart consumption failure. Fault injection affects only the isolated test app.
Migration up/down/reapply and database constraints run in a separate temporary
schema inside a rolled-back transaction, without dropping application tables.
The down migration drops order tables and their contents; it is not run against
real order data during these tests.

Retrieval coverage includes empty history, newest-first ordering, owner isolation,
all shared status values, snapshot preservation, authentication/RBAC, invalid IDs,
revoked sessions and safe unexpected-failure logging (unit tests).
