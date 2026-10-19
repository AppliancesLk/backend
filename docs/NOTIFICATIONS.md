# Appliances.lk email notifications

`NotificationModule` provides transactional email for Auth, Orders, Payments and Repairs. Its business methods select templates and trusted recipients; `EmailService` alone uses Nodemailer/Gmail SMTP. There is no public send-email API, queue infrastructure, campaign manager or scheduler.

## Local Gmail setup

Fill the prepared placeholders in **`backend/.env`**:

```dotenv
EMAIL_PROVIDER=gmail
EMAIL_USER=your-address@gmail.com
EMAIL_APP_PASSWORD=your-google-app-password
EMAIL_FROM_NAME=Appliances.lk
EMAIL_FROM_ADDRESS=your-address@gmail.com
```

Use a **Gmail App Password**, not the normal account password. Google requires 2-Step Verification before creating an App Password; managed or protected accounts can have additional restrictions. See [Google's setup instructions](https://support.google.com/accounts/answer/185833). Spaces in copied App Passwords are removed. The sender address defaults to `EMAIL_USER` when blank. Use the same Gmail address for both fields; Gmail may rewrite unapproved sender addresses.

Credentials are backend-only and `.env` is ignored by Git. Restart the backend after changing them. The local notification migration has already been applied. For another database, run from `backend`:

```powershell
npm install
npm run migration:run -- -d src/database/data-source.ts
npm run start:dev
```

### Real email test

From `backend`, after configuring Gmail:

```powershell
npm run email:test
```

This builds and runs `scripts/test-email.cjs`, sending one test message **to EMAIL_USER itself**. It closes its transport, refuses production mode, and creates no HTTP endpoint. Gmail acceptance is not a final inbox-delivery guarantee: check inbox and spam. No real delivery was exercised during implementation because the Gmail address and App Password were blank.

Safe failure reasons include `invalid_configuration`, `EAUTH`, `ECONNECTION`, `ETIMEDOUT`, `ESOCKET`, `EDNS`, `recipient_rejected` and `smtp_error`. Check the App Password/account access for EAUTH and network access for connection failures. Credentials, provider error bodies, full HTML and message content are not logged.

## Files and architecture

```text
src/notification/
  notification.module.ts
  notification.service.ts
  entities/notification.entity.ts
  types/notification.types.ts
  email/
    email.service.ts
    email.types.ts
    templates/
      email-layout.ts
      welcome-email.template.ts
      login-notification.template.ts
      order-created.template.ts
      payment-success.template.ts
      payment-failed.template.ts
      order-status-updated.template.ts
      repair-request-created.template.ts
      repair-approved.template.ts
      repair-rejected.template.ts
      repair-status-updated.template.ts
      repair-ready-for-collection.template.ts
      promotion.template.ts
```

Other changes integrate NotificationService into the Auth/Orders/Payments/Repairs modules and services, register the entity in the CLI data source, and add environment settings, package scripts and tests. Dependencies added are `nodemailer` and development-only `@types/nodemailer`. The frontend application is unchanged; its test backend helper now mocks SMTP.

The reusable transporter uses the Gmail service preset, pooling with two connections, explicit connection/greeting/socket/DNS timeouts, SMTP debug logging disabled, and file/URL content access disabled. See [Nodemailer SMTP documentation](https://nodemailer.com/smtp).

```mermaid
sequenceDiagram
    participant Business as Business service
    participant DB as PostgreSQL
    participant Notification as NotificationService
    participant Email as EmailService / Gmail
    Business->>DB: Commit successful business operation
    Business->>Notification: Send business notification
    Notification->>DB: Read account email; claim unique PENDING event
    Notification->>Email: Send generated HTML and text
    Email-->>Notification: Accepted or safe failure
    Notification->>DB: Persist SENT / FAILED
    Notification-->>Business: Result; failures do not throw
```

## Notification methods and example events

| Type / method | Trigger | Included information |
| --- | --- | --- |
| WELCOME / `sendWelcomeEmail` | Register a customer | Username, account confirmation, shopping/repair capabilities |
| LOGIN / `sendLoginNotification` | Successful login, including staff | Username, login time in Sri Lanka, security guidance |
| ORDER_CREATED / `sendOrderCreatedEmail` | Create an order from checkout | Persisted reference/date, item snapshots, quantities, unit/line prices, total, delivery address and pending-payment status |
| PAYMENT_SUCCESS / `sendPaymentSuccessEmail` | Signed PayHere success after transaction commit | Order/payment reference, verified paid amount, confirmed status |
| PAYMENT_FAILED / `sendPaymentFailedEmail` | Signed callback enters FAILED (`-2` or `-3`) | Order, attempted amount, safe failure message, retry/status guidance |
| ORDER_STATUS_UPDATED / `sendOrderStatusUpdatedEmail` | Admin changes status, e.g. CONFIRMED → PROCESSING | Previous/new actual status and a matching explanation |
| REPAIR_CREATED / `sendRepairRequestCreatedEmail` | Submit a repair form | Reference, device, problem, submission date, initial status |
| REPAIR_APPROVED / `sendRepairApprovedEmail` | Approve a pending repair | Device/reference, approval/status, progress guidance |
| REPAIR_REJECTED / `sendRepairRejectedEmail` | Reject a pending repair | Device/reference, rejection/status update |
| REPAIR_STATUS_UPDATED / `sendRepairStatusUpdatedEmail` | Assigned repairer advances progress | Device/reference, new status and explanation |
| REPAIR_READY_FOR_COLLECTION / `sendRepairReadyForCollectionEmail` | Reach READY_FOR_COLLECTION | Dedicated collection message; contact-store guidance |
| PROMOTION / `sendPromotionEmail` | Future trusted internal call only | Title, description, optional product/message/link/valid-until |

Order creation occurs at PENDING_PAYMENT, before stock deduction. That email explicitly says payment is still required. Success email is separate and follows backend verification/commit, never a frontend claim. Pending/cancelled payment callbacks do not produce failure emails. Cancellation emails do not claim a refund occurred.

Recipients come from `UsersService.findById(...).email`, never the checkout delivery email or an arbitrary public request. Templates use persisted business snapshots. Dynamic HTML is escaped, subject newlines are removed, links allow only HTTP/HTTPS without credentials, and both HTML/plain text are generated. Date formatting uses `Asia/Colombo`.

Rejection reasons are not persisted in the existing repair model, so emails omit them. Collection hours/address are not defined, so none are invented. This change adds no assignment endpoint: repairer flows need an already assigned ticket. Approval uses the URL ID and requires no body. Rejection accepts an optional reason; a legacy body ID is optional and never overrides the URL ID.

The promotion method accepts a backend user ID and optional stable event ID. It does not implement campaigns, scheduling, segmentation or automatic sends.

## Notification history

Migration: **`1792300000000-CreateNotifications.ts`**. `synchronize` remains false.

| Column | Type / role |
| --- | --- |
| `id` | Generated UUID primary key |
| `userId` | UUID FK to users; cascade on account deletion |
| `type` | One of the twelve notification types |
| `channel` | EMAIL |
| `recipient` | Account email snapshot, varchar(320) |
| `subject` | Subject snapshot, varchar(300) |
| `status` | PENDING / SENT / FAILED |
| `eventKey` | Unique varchar(300) event claim |
| `relatedEntityType`, `relatedEntityId` | Optional domain kind and UUID historical reference |
| `sentAt`, `failedAt` | Optional timestamptz timestamps |
| `createdAt` | Attempt timestamp |

The table has type/channel/status checks, a user/date index, and named unique constraint `UQ_notifications_event_key`. Historical related IDs are not foreign keys to orders/payments/repairs. Bodies, credentials, tokens, raw provider payloads and card information are not stored. There is no public history API or retention scheduler.

For local metadata inspection:

```sql
SELECT id, type, status, "relatedEntityType", "relatedEntityId", "sentAt", "failedAt"
FROM notifications ORDER BY "createdAt" DESC LIMIT 30;
```

### Duplicate protection

- Welcome and order creation use one key per user/order. Order submission replays do not send again.
- Each successful login is a distinct activity and gets a distinct key.
- Success is claimed once per payment; verified success-callback idempotency is preserved.
- Repeated failed callbacks are suppressed. A failure key includes a hash of the provider attempt ID, so a genuinely different payment attempt can notify again.
- Unchanged order statuses do not notify; status keys include the order/new status.
- Repair created/approved/rejected/ready messages are claimed once per ticket/type. Generic progress includes status and persisted update time to support real progress cycles.
- READY_FOR_COLLECTION selects only its dedicated email, not a generic-plus-dedicated pair.
- A future promotion caller can pass the same internal event ID to suppress repeated sends.

## Failure behavior and limits

SMTP and history failures are secondary: the already successful login, registration, order, payment or repair operation remains successful. Calls are synchronous after commit with network timeouts, so slow SMTP can add response latency. Missing configuration produces a failed notification attempt, not a startup/authentication failure.

This is not a durable outbox. A process crash between business commit and notification claim can lose an event; a later crash can leave a PENDING record. There is no worker, retry scheduler, or automatic replay of FAILED/PENDING events. SMTP acceptance followed by a network disconnect also makes exact-once inbox delivery impossible to guarantee.

If Gmail accepted an email but the history update fails, logs identify the history uncertainty and the original event claim prevents a repeat send. SENT means accepted by SMTP, not guaranteed final delivery. An accepted message is not explicitly marked as an SMTP failure solely because its history update failed.

## Automated testing

```powershell
npm run test:notifications
npm run test:notifications:integration
npm run build
npm run lint
```

Unit tests mock Nodemailer/EmailService and cover transport reuse, safe logging, configuration failure, HTML/link/header safety, trusted recipients, all templates, duplicate claims and secondary-operation failures. Integration tests use real HTTP/auth/PostgreSQL with mocked SMTP and exercise all business triggers, callback/status replays, ready-for-collection selection and primary-operation success despite mail failures.

All backend integration scripts and the frontend browser-test backend bootstrap mock EmailService. Automated tests never require or use real Gmail credentials. Real delivery testing is the explicit `email:test` script after local Gmail configuration.

### Verification performed

- 16 notification unit tests passed.
- 28 notification HTTP/PostgreSQL integration checks passed, including concurrent event deduplication.
- Existing auth, admin, catalog, cart, checkout, orders, payments, repairs, product-experience and AI integration suites passed: 538 checks.
- Existing auth/order unit suites passed alongside notification tests.
- Backend build passed; lint passed with three existing unused-catch-variable warnings in repairs.
- The common order email layout was rendered and visually inspected at mobile width, with no horizontal overflow.
- Gmail SMTP delivery remains unverified until the owner fills the currently blank Gmail credentials and runs `npm run email:test`.
