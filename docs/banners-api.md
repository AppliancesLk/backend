# Homepage banners

Run `npm run migration:run -- -d src/database/data-source.ts` before starting the updated backend. The migration creates four hidden, empty sections and does not change product or user data.

Public: `GET /banners` returns visible sections only. Render positions by their keys, not response order.

Admin (existing session authentication and ADMIN role):

- `GET /banners/admin/all` returns all four positions.
- `PUT /banners/:position` replaces `{ visible, slides }` for one position.
- `POST /banners/images` accepts multipart field `image`, one PNG/JPEG/WebP up to 5 MB. Returns `{ imageUrl }`.

Positions: `top` allows 0–4 slides; `middle`, `bottom-one`, and `bottom-two` allow 0–1 each. Visible sections require an image. Limits also have database constraints.

Each slide requires `imageUrl`, `alt`, `title`, `description`, `buttonText`, and `href`. Optional text uses empty strings. Button text and destination must both be present or both empty. Destinations accept internal paths or HTTPS links. Executable, protocol-relative, and backslash URLs are rejected.

Images are served by `GET /banners/images/:filename`. Uploads keep their original bytes and use generated filenames. Set `BANNER_UPLOAD_DIR` to a persistent absolute storage directory in deployment; the default is `uploads/banners` relative to the backend working directory. Back up that directory alongside the database. Replaced images are retained to avoid breaking other banners; storage cleanup is manual.

Frontend management: `/admin/banners`. Admins can preview, reorder, remove, save, and independently show/hide each section. Saving is per section. External images must use HTTPS. Recommended sizes: hero 1920×720; other banners 1600×500. Images use contain sizing so artwork is not cropped.
