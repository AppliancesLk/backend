# Checkout preparation API

`POST /checkout/prepare` validates the authenticated CUSTOMER's current cart and
returns a fresh checkout summary. Success is HTTP 200; no checkout/order/payment
record is created. No database migration is required.

## Authentication and request

Uses the existing cookie session via `JwtAuthGuard`, plus `RolesGuard` for the
CUSTOMER role. Identity comes only from `request.user.sub`. The existing guard
verifies that the session's user still exists and is active. There is no separate
JWT implementation. Include browser credentials and the existing
`X-Requested-With: XMLHttpRequest` header; browser Origin must match FRONTEND_URL.

```json
{
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

All delivery fields except `addressLine2` are required. Strings are trimmed;
`countryCode` is normalized to uppercase. Names are 1-80 characters, address
lines at most 200, city 1-100, email valid and at most 254, and phone valid under
the existing Sri Lankan store context (local Sri Lankan or valid international
format, at most 30 characters). Postal code accepts 2-20 letters/digits/spaces/
hyphens, and country code must be an ISO 3166-1 alpha-2 code. These are input
validation rules, not address verification or a delivery coverage policy.
Null delivery/required fields and explicit null addressLine2 are rejected.

Global whitelist validation rejects unknown root or nested properties. Do not
send customerId, userId, cartId, cart items, prices, totals, fees, or discounts.
The delivery contact email is separate from the authenticated account identity.

## Response

```json
{
  "cartId": "<cart-uuid>",
  "customerId": "<authenticated-customer-uuid>",
  "preparedAt": "2026-10-17T10:00:00.000Z",
  "currency": "LKR",
  "items": [
    {
      "cartItemId": "<item-uuid>",
      "productId": "<product-uuid>",
      "name": "Example appliance",
      "SKU": "EXAMPLE-1",
      "quantity": 2,
      "unitPrice": "1234.50",
      "lineTotal": "2469.00"
    }
  ],
  "itemCount": 1,
  "subtotal": "2469.00",
  "total": "2469.00",
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

The Checkout service reads through the exported Cart service, which owns cart
queries and uses Products/Categories services for current prices, activity,
category ancestry visibility, and stock. Stock currently belongs to Products;
no independent Inventory module exists. Cart/product/category reads share one
REPEATABLE READ PostgreSQL snapshot/connection, with Cart's normal ownership
scope and shared cart lock. Checkout independently recomputes line totals,
subtotal, and final total from those trusted current unit prices. Shared money
helpers use bigint minor units and fixed two-decimal strings, including totals
beyond JavaScript Number precision.

Total currently equals subtotal. No delivery charge, tax, discount, loyalty,
payment minimum, or other financial policy is introduced by this ticket.
Preparation does not persist delivery data, freeze prices, reserve stock,
deduct stock, clear the cart, create orders, or contact PayHere.

This summary is a point-in-time validation result, not a stored quote or payment
authorization. A later backend order/payment flow must revalidate cart, price,
stock, delivery, and any future charges, and must never trust a summary posted
back by the frontend.

## Errors and unavailable products

- 400: invalid delivery/body data or empty cart.
- 401: missing, invalid, expired/revoked session or inactive customer.
- 403: staff role or existing browser Origin/header policy failure.
- 404: missing product detected by the owning Cart service.
- 409: unavailable product, invalid stored quantity, insufficient stock, or cart
  changed while its repeatable-read snapshot was being acquired.

Stock conflicts return `cartItemId`, `productId`, `requestedQuantity`, and
`availableStock`. Other item conflicts return the affected item/product IDs.
Nest's statusCode/error/message structure is preserved. Inactive products or
products in a hidden category/ancestor cannot proceed. Hard product deletion
already cascades its cart items, so deleted products cannot be included; if that
empties the cart, preparation returns 400.

Successful preparation and service failures log operation, safe account/cart
identifiers where available, outcome, failure classification/status, and item
count. Delivery details, email/phone/address, raw errors, bodies, passwords,
cookies, tokens, and payment secrets are not logged.

## Verification

```sh
npm run build
npm run lint
npm run test -- --runInBand src/checkout/services/checkout.service.spec.ts src/cart/services/cart.service.spec.ts src/products/services/products.service.spec.ts src/auth/services/auth.service.spec.ts
npm run test:checkout:integration
npm run test:cart:integration
npm run test:auth:integration
npm run test:admin:integration
```

Integration tests use the configured migrated development PostgreSQL database
and an isolated application instance. They create unique temporary users and
catalog fixtures, clean up only their own records, and exercise real HTTP DTO
validation, authentication/RBAC, account isolation, current price changes,
stock/activity/category changes, exact totals, repeated preparation, and
preservation of cart/inventory data. Unit tests cover safe logging and retryable
snapshot conflicts as well as pricing and availability rules.
