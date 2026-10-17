# PayHere payment API

The Payments module owns PayHere-specific preparation and notification handling.
The backend remains the source of truth for customer identity, order ownership,
amount, currency, payment state, order state, and inventory.

## Configuration

Local environment:

    PAYHERE_MERCHANT_ID=<sandbox merchant ID>
    PAYHERE_MERCHANT_SECRET=<sandbox domain merchant secret>
    PAYHERE_MODE=sandbox

The committed example leaves both credentials blank. The service returns a safe
configuration error until both are configured. The merchant secret is used only
inside the backend hash functions and is never returned or logged.

## Initiate payment

    POST /payments/initiate
    Content-Type: application/json
    Cookie: appliances_session=...

    { "orderId": "<owned-order-uuid>" }

JWT session authentication and the CUSTOMER role are required. Unknown and
unowned orders both return 404. Only PENDING_PAYMENT orders with a positive
trusted total can be initiated. Extra fields such as amount, currency, status,
or customerId are rejected by global validation.

The endpoint creates or refreshes one PENDING payment per order and returns the
PayHere gateway URL plus safe form fields. Amount, currency, delivery data, and
order reference come from PostgreSQL. The checkout hash follows PayHere's
documented formula:

    UPPER(MD5(merchant_id + order_id + amount + currency +
      UPPER(MD5(merchant_secret))))

## Read verified payment state

    GET /payments/orders/:orderId

JWT session authentication and the CUSTOMER role are required. The lookup is
scoped by both order ID and authenticated customer ID; unknown and unowned
payments both return 404. The response exposes only the internal payment ID,
order ID, trusted amount/currency, status, and timestamps. It never returns the
PayHere payment ID, provider status code, merchant secret, or callback data.

Frontend PayHere completion, dismissal, and error callbacks are only prompts to
read this endpoint. They are never accepted as proof that payment succeeded.

The request's backend origin is used to form the notify URL. When testing the
real sandbox, expose the backend through a public HTTPS URL because PayHere
cannot notify localhost. Configure the reverse proxy/tunnel to preserve the
public host and protocol.

## PayHere notification

    POST /payments/payhere/notify
    Content-Type: application/x-www-form-urlencoded

This route intentionally does not require a customer session or browser-origin
header because PayHere calls it server-to-server. Its browser-security exception
is limited to this exact POST path. DTO validation still rejects missing,
malformed, and unknown fields.

The service verifies the configured merchant ID and performs a timing-safe
comparison with PayHere's documented notification signature:

    UPPER(MD5(merchant_id + order_id + payhere_amount +
      payhere_currency + status_code + UPPER(MD5(merchant_secret))))

Only after signature verification does it load the payment. It then compares the
notification amount and currency with the stored trusted values.

Status mapping:

- 2 becomes SUCCESS and confirms the order.
- 0 remains PENDING.
- -1 becomes CANCELLED.
- -2 and -3 become FAILED.

A successful callback locks the payment, order, and products in one database
transaction. It revalidates product/category availability and stock, deducts
each purchased quantity, marks the payment SUCCESS, and marks the order
CONFIRMED. Any failure rolls back all changes.

The unique order constraint prevents duplicate payment rows. The payment row
lock serializes concurrent callbacks. Once SUCCESS is committed, callbacks with
the same PayHere payment ID are acknowledged as duplicates and do not deduct
stock or confirm the order again. A different provider payment ID is rejected.

The implementation follows the official PayHere Checkout API:
https://support.payhere.lk/api-%26-mobile-sdk/checkout-api.I

## Database

Migration CreatePayments1792240000000 creates the payment status enum, payments
table, ownership relationships, exact amount constraints, and unique indexes for
order and non-null PayHere payment IDs. TypeORM synchronization remains disabled.

## Verification

    npm run migration:run -- -d src/database/data-source.ts
    npm run build
    npm run lint
    npm run test:payments:integration
    npm run test:orders:integration

The payment integration test uses the real configured PostgreSQL database and a
local sandbox secret to validate initiation hashes and signed form callbacks.
It covers ownership, rejected client amounts, invalid signatures, amount
mismatch, persisted failure, concurrent duplicate success callbacks, atomic
stock deduction/order confirmation, and retry restrictions. For an external
PayHere sandbox test, add the real sandbox merchant secret locally, expose this
backend publicly over HTTPS, initiate an order payment, submit the returned form
fields to the sandbox gateway, and confirm the callback updates PostgreSQL.
