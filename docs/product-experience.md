# Product images, details, reviews, and demo catalog

Run `npm run migration:run -- -d src/database/data-source.ts` before starting the updated backend. Migration `1792280000000` adds category images, product detail fields, rating summaries, and the product review table. Existing images, specifications, products, and users are preserved. It has a reversible `down()` migration.

## Images

Admin-only `POST /media/images` accepts multipart field `image`: one decoded PNG, JPEG, or WebP, up to 5 MB and 40 million pixels. Animated images, SVG uploads, and malformed files are rejected. Responses contain `{ imageUrl }`; store that relative URL in a product's `images` array or a category's nullable `imageUrl`. Products support up to ten images. `GET /media/images/:filename` serves images publicly with a fixed image MIME type and `nosniff`.

Storage defaults to `uploads/media`. Set `MEDIA_UPLOAD_DIR` to a persistent absolute directory in deployment and back it up with the database. Existing banner routes remain compatible and share the validated storage service; they retain `BANNER_UPLOAD_DIR` and their original URL prefix. Removing an image from a form removes its reference; files are retained because other products/categories can share them. Orphan-file cleanup is manual.

The existing product create/edit forms now support choosing files, image previews, removal, ordering, and URL entry. Uploads preserve original image bytes and quality. Category create/edit supports one image, replacement/removal, name, and parent. Parent updates reject hierarchy cycles. Category images appear on customer category tiles.

## Product content

Admin product create/update APIs accept `description` (up to 10,000 characters), `features` (up to 20 strings), `boxContents` (up to 30 strings), and `warranty` (up to 300 characters). List entries are at most 300 characters. Plain text is rendered without HTML injection. Existing JSON specifications remain supported, including typed/nested values. Rating summary fields are server-owned and cannot be set through product DTOs.

Customer details include thumbnails, image navigation, a keyboard-accessible zoom dialog, overview/specifications/box/review tabs, real rating totals, related products, and a stock-bounded quantity selector. Buy Now adds the selected quantity to the existing cart and opens the existing checkout; it does not clear other cart items. Warranty, box contents, features, and descriptions display only supplied data or an honest empty state. No unsupported delivery, tax, manufacturer, or warranty promises are added.

## Reviews

- Public `GET /products/:productId/reviews?page=1`: five reviews per page, safe author username, real average/count and distribution. Hidden products are not exposed.
- Customer `GET /products/:productId/reviews/mine`: own review or null.
- Customer `POST /products/:productId/reviews`: `{ rating: 1..5, title, body }`, one review per customer/product.
- Customer `PUT /products/:productId/reviews/mine`: edit only the current customer's review.
- Customer/Admin `DELETE /products/:productId/reviews/:reviewId`: customers can delete only their own; admins can moderate any.
- Admin `GET /products/:productId/reviews/admin/all?page=1`: includes reviews for hidden products; the product editor provides moderation controls.

Titles require 2–120 trimmed characters; bodies require 10–3,000. Existing session/role guards apply. Client-supplied author, aggregate, or verified-purchase fields are rejected. Verified purchase is calculated from actual delivered orders through the Orders service. Customers may leave unverified reviews too. Product-row locks serialize review writes and aggregate recalculation in one transaction. User foreign keys use RESTRICT so account deletion cannot silently invalidate totals. No fake reviews are seeded.

## Demo catalog seed

```powershell
npm run seed:catalog:check
npm run seed:catalog
```

The first command validates the schema and makes no changes. The second builds the backend and adds 20 category groups with five products each: 100 products, at least 14 category-specific specifications per product, descriptions, features, box contents, warranty notes, brand/price/stock metadata, and two local illustrations per product. Twenty category illustrations are also generated. It uses `sharp`, makes no image-network requests, and requires no API credentials.

These are explicitly named Demo products from fictional brands. Prices, specifications, and illustrations are development examples, not supplier or manufacturer claims. The seed refuses production mode. Replace demo entries with verified inventory before commercial use.

The script checks schema columns before writing, uses a database transaction/advisory lock, deterministic category/product/image IDs, and unique `DEMO-V1-*` SKUs. Reruns skip existing SKUs and reuse matching top-level categories instead of duplicating them. It preserves manual edits to existing products and existing category visibility/content. No users, passwords, orders, or reviews are created or reset.

Validation commands: backend `npm run test:experience:integration`; frontend `npm run test:experience:e2e`. Existing catalog, product-edit, and image/banner checks should remain compatible.
