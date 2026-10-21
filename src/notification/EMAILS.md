# Notification emails

All fourteen notification types use the shared Lagoon and Saffron layout in
`email/templates/email-layout.ts`, matching `frontend/design.md`. The PNG plug
mark is embedded with a CID attachment so it does not require a hosted logo.
The wordmark, message, details and action remain readable with images disabled.
Fonts use Bricolage Grotesque and Instrument Sans when available, with email-safe
Arial/Helvetica fallbacks. Essential layout styles are inline and table based.

Order confirmations include each item's **saved checkout image**, name, SKU,
quantity, unit price and line total, plus the order total. No new product lookup
is made, so later catalog changes cannot change the order details in the email.
Missing or unsafe image sources use a quiet “No image” placeholder. Images do
not replace the item details or the plain-text version of the message.

Absolute `http(s)` image URLs work directly. For uploaded images stored as
`/media/images/...`, set `EMAIL_ASSET_BASE_URL` to the public API/media origin,
for example `https://api.your-store.example`. Without it, relative image URLs
use the placeholder. The origin must be reachable without authentication from
the recipient's device; localhost will only work on the development machine.
Mail clients may still require recipients to allow remote images. Images are
never fetched by the backend or attached as arbitrary files.

`FRONTEND_URL` continues to control order, repair and storefront action links.
Order subjects use the short reference; the full reference remains in the body.
Payment verification, notification history and duplicate suppression are unchanged.

Run `npm run email:preview` from `backend` to generate all templates with sample
data in `.temp/email-previews/index.html`, including plain-text versions. This
command does not start the application, query the database, or send email. If a
local public product upload exists, it is embedded in the preview for convenience.

Run `npm run test:notifications` for mocked unit tests, and
`npm run test:notifications:integration` for the HTTP/database flows with SMTP
mocked and generated test records cleaned up afterward. `npm run email:test` is
the separate real-delivery smoke test; it is not needed to preview templates.

Email verification and password reset use the same notification service and branded layout. Account links keep the single-use token in a URL fragment, then submit it in a POST body. Notification history stores subjects and delivery state, never the link or raw token.
