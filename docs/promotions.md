# Admin promotion emails

The `promotions` module owns editable drafts, immutable send snapshots, recipient reports and a PostgreSQL-backed delivery queue. It delegates individual emails to the existing `NotificationService` and pooled `EmailService`.

## Setup

Apply migrations before starting the updated backend:

```sh
npm run migration:run -- -d src/database/data-source.ts
```

- `1792600000000-AdminPromotions`: drafts, send attempts and recipients.
- `1792600100000-PromotionQueueIsolation`: private worker queue namespace.

Normal `main.ts` startup starts `PromotionWorker` and enables graceful shutdown. No external queue or new package is needed. Existing email configuration still applies; see `src/notification/EMAILS.md`. Set the existing `FRONTEND_URL` to the public shop URL. Relative product image paths require the existing `EMAIL_ASSET_BASE_URL` to point to the public API/media origin. The backend never downloads remote product images.

`PROMOTION_QUEUE_KEY` is optional and defaults to `live`. Processes delivering the same queue must use the same key. Test bootstraps use unique keys and mocked SMTP so real workers cannot consume test messages. The key is server configuration and cannot be supplied through the API.

## Admin API

All endpoints require an authenticated `ADMIN` and the existing browser request protections.

| Method | Path                                       | Purpose                                                            |
| ------ | ------------------------------------------ | ------------------------------------------------------------------ |
| GET    | `/admin/promotions?page=1&search=`         | Paginated drafts and latest delivery summaries                     |
| POST   | `/admin/promotions`                        | Save a new draft                                                   |
| POST   | `/admin/promotions/preview`                | Render an unsent draft and count eligible recipients               |
| GET    | `/admin/promotions/:id`                    | Editable draft, selected user/product metadata and latest 20 sends |
| PATCH  | `/admin/promotions/:id`                    | Update a draft with its current `version`                          |
| POST   | `/admin/promotions/:id/send`               | Queue one immutable send; returns 202                              |
| GET    | `/admin/promotions/:id/runs/:runId?page=1` | Original email preview and paginated recipient results             |

Draft and preview payload:

```json
{
  "subject": "Something useful for your home",
  "headline": "Your next everyday favourite",
  "preheader": "Selected appliances, chosen for you.",
  "body": "Discover our latest collection.\n\nVisit the shop for current prices and availability.",
  "buttonText": "Explore the collection",
  "buttonUrl": "",
  "footerNote": "While stocks last.",
  "audience": "SELECTED",
  "userIds": ["<user UUID>"],
  "productIds": ["<product UUID>"]
}
```

Use `ALL` for all active, verified accounts, including staff accounts; user IDs are then ignored. Selected audiences support up to 1,000 unique users. All accounts must be active, verified and not deactivated. Products must be active; select up to 12. At least one product and eligible recipient are required to send.

Drafts can be incomplete. Sending requires a subject, headline and body. Copy is plain text with preserved line breaks, escaped before HTML rendering. Header newlines are rejected. Optional custom button URLs must be complete HTTP(S) URLs without credentials. Empty button URLs use the shop's products page. Product prices, names, images and links are resolved on the server, rather than accepted from the editor.

PATCH adds `version` to the draft payload. Stale saves receive 409. Send payload:

```json
{
  "version": 1,
  "requestId": "<fresh UUID v4>",
  "expectedRecipients": 42
}
```

The editor saves and reviews before sending. If the eligible count or saved version changes, the server returns 409 and requires another review. Reuse the same `requestId` when retrying an uncertain HTTP response: it returns the original send without duplicate mail. A deliberate resend uses a new ID. Only one send per promotion can be active at a time. Sent content and product prices remain unchanged when the draft is subsequently edited.

## Delivery behavior

Workers atomically claim up to five recipients per pass with `FOR UPDATE SKIP LOCKED`; passes run every 2.5 seconds. Each message is sent separately, without exposing other recipients. Eligibility and the queued email address are checked again before dispatch. Deleted, disabled, unverified or changed-address accounts are skipped.

Notification event keys include the send ID and user ID. There is no automatic resend of failed or uncertain emails. A timed-out SMTP attempt, or a processing claim abandoned for 15 minutes after a crash, is reported as `UNKNOWN`. Administrators should inspect the report before deliberately resending, since the provider may have accepted an uncertain attempt. Completed runs expose sent, failed, skipped and unknown counts. `SENT` means accepted by the SMTP server; inbox delivery/open tracking is not provided.

## Tests

```sh
npm run test:promotions
npm run test:promotions:integration
```

Integration tests use real authentication, HTTP and PostgreSQL with an isolated queue and mocked SMTP. They cover authorization, validation, recipient eligibility, preview safety, duplicate submission protection, immutable versions, resends, provider failures, uncertain attempts, queue isolation and all-users audiences. Temporary campaigns, deliveries, accounts and notification records are removed afterward. Use a development/test database.
