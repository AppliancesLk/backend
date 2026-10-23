# Backend container

Build from the backend repository root:

```powershell
docker build -t applianceslk-backend:local .
```

The image builds with Node.js 24, includes compiled code and production dependencies,
and runs as the unprivileged `node` user on port 3000. Secrets and local uploads are
excluded from the build. Supply configuration at runtime using `--env-file` or Compose.
Persist `/app/uploads` to retain media and banner images across container recreation.

`DB_HOST` must be the database container's service name (for example `database`),
not `localhost`. The database is PostgreSQL and `synchronize` remains disabled.
Before starting the server against a new database, run the compiled migrations
using the same image and database environment:

```text
node node_modules/typeorm/cli.js migration:run -d dist/database/data-source.js
```

The local Compose setup runs this as a one-off service before the backend starts.
Running the command again applies only pending migrations. Source-based development
commands still work, for example:

```powershell
npm run migration:run -- -d src/database/data-source.ts
```

`GET /health/database` is the container health check. Set `FRONTEND_URL` to the exact
browser origin, including the port, for cookie authentication, CSRF checks and chat.
The image defaults to `NODE_ENV=production`, which enables Secure session cookies and
requires HTTPS. The external local Compose setup overrides it to `development` to
test over HTTP while still running compiled code with production dependencies.

Optional runtime integrations use the existing `EMAIL_*`, `GEMINI_*`, and `PAYHERE_*`
variables. `EMAIL_ASSET_BASE_URL` must be a publicly reachable API/media URL when
images need to appear in real emails. Never put those credentials in image build args.

For deployment, use HTTPS, production environment values, managed secrets and
appropriate database/upload backups. The sibling Compose folder is for local testing.
