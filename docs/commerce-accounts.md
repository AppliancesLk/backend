# Cash on delivery, tracking, loyalty and account lifecycle

## Changes

- Checkout supports cash on delivery alongside PayHere. COD confirms an order
  and reserves inventory immediately, with no gateway call. A fully redeemed
  order is marked as paid with the internal `LOYALTY` payment method.
- Customers see recorded status changes and timestamps. Admins advance orders
  through confirmed, processing, shipped and delivered. Completing a COD delivery
  requires an explicit confirmation that cash was collected.
- Loyalty is stored as LKR credit. A delivered, paid order earns **0.1% of its
  remaining amount paid after redeemed credit**, rounded down to a cent. For
  example, LKR 100,000 earns LKR 100. Credit can partially or fully pay for any
  product. No rewards are earned on the credit portion itself.
- Admins can search and filter users, deactivate accounts, and restore access.
  Deactivation revokes sessions and outstanding account links, preserving order
  and account records. An admin cannot deactivate themselves or the last active
  admin. Restoring an unverified account returns it to awaiting verification;
  it still cannot sign in until email verification succeeds.
- New registration creates an inactive account and sends a verification email.
  Verification is required before sign-in. Resend and forgotten-password requests
  use generic responses and a one-minute per-account email cooldown.
- Password resets use a single-use email link, replace the password hash, and
  revoke all sessions. Resetting a password cannot reactivate a disabled account.

All account emails use the existing notification service, delivery history,
and Lagoon and Saffron templates. No tokens or full email bodies are persisted
in notification history. Verification links last 24 hours; reset links last
30 minutes. Only SHA-256 token hashes are stored. Links carry the token in a URL
fragment, then the frontend submits it in a POST body. A GET or mail preview does
not consume an account link.

## API

| Method | Route                       | Access / behavior                                                                      |
| ------ | --------------------------- | -------------------------------------------------------------------------------------- |
| POST   | `/auth/register`            | Public; returns `requiresVerification`, email and a message, without a session         |
| POST   | `/auth/verify-email`        | Public; `{ token }`, activates an eligible account once                                |
| POST   | `/auth/resend-verification` | Public; `{ email }`, generic response                                                  |
| POST   | `/auth/forgot-password`     | Public; `{ email }`, generic response                                                  |
| POST   | `/auth/reset-password`      | Public; `{ token, password }`, revokes sessions                                        |
| GET    | `/admin/users`              | Admin; paginated `page`, `limit`, `search`, `role`, `status` filters                   |
| GET    | `/admin/users/:id`          | Admin; explicit public account fields                                                  |
| PATCH  | `/admin/users/:id/active`   | Admin; `{ isActive: boolean }`                                                         |
| GET    | `/loyalty`                  | Customer; balance and 50 most recent ledger entries                                    |
| POST   | `/orders`                   | Customer; existing delivery/idempotency fields plus optional payment method and credit |
| POST   | `/orders/:id/cancel`        | Owner; pending online or confirmed COD order only                                      |
| PATCH  | `/admin/orders/:id/status`  | Admin; existing status plus optional `paymentCollected`                                |

For order creation, `paymentMethod` accepts `PAYHERE` or `CASH_ON_DELIVERY`.
It defaults to PayHere for existing API clients. `loyaltyAmount` is an optional
nonnegative decimal **string** (for example `"25.50"`), not a client-calculated
discount or total. The backend revalidates the balance, prices, stock and amount
under the order transaction. `LOYALTY` is assigned by the server only when the
remaining amount is zero. COD and loyalty orders cannot use PayHere endpoints.

Order responses include `paymentMethod`, `loyaltyRedeemed`, `loyaltyEarned`, and
`history` entries containing `id`, `status` and `createdAt`. COD payments stay
pending until collection. Admin delivery requires `paymentCollected: true` if
cash is still outstanding. Verified online orders use the same tracking and
loyalty completion flow.

Ledger uniqueness, user/order locks and existing order idempotency prevent
duplicate rewards, overspending, double stock deductions and repeated refunds.
Cancellation returns redeemed credit and reserved inventory once. Existing
manual handling of online cash refunds remains; a cancelled email does not
claim that the bank payment was refunded.

## Database and configuration

Run from `backend`:

```sh
npm run migration:run -- -d src/database/data-source.ts
```

The two migrations are `AccountLifecycle1792400000000` and
`CodLoyaltyTracking1792410000000`. They have been applied to the current local
database. Synchronization remains disabled.

Existing accounts are grandfathered as verified, retaining their current access
state. Existing orders receive one history entry for their current recorded
status; earlier events are not invented. Previously delivered orders are not
retroactively credited. Existing non-COD orders retain the PayHere method.
The trusted admin seed script also supports the verified-account fields.

No new credentials are required. Configure the existing Gmail settings and
`FRONTEND_URL` so verification and reset links reach the deployed frontend.
`EMAIL_ASSET_BASE_URL` continues to control relative product image URLs.

## Validation

```sh
# Backend: real PostgreSQL and HTTP, mocked SMTP and signed gateway callbacks
npm run test:commerce:integration
npm run test:orders:integration
npm run test:payments:integration
npm run test:notifications:integration
npm run test:auth:integration

# Frontend: desktop and mobile with the real local backend
npm run test:commerce:e2e
npm run test:checkout
```

New integration tests cover email verification expiry/replay/rotation, password
resets and session revocation, COD collection, state transition rules, tracking,
exact loyalty accrual/redemption, full credit purchases, cancellation restoration,
concurrent checkout, PayHere regressions and admin account access. Existing
feature fixtures now verify and sign in through the real auth endpoints.
The browser test bootstrap exposes a mocked fixture mailbox for example.com
addresses only. That route is absent from the production application.
