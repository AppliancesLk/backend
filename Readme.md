# Appliances.lk — Backend API

<p align="center">
  <strong>Mobile Accessories E-Commerce & Device Repair Management Platform</strong><br>
  NestJS · TypeScript · PostgreSQL · TypeORM · Socket.IO · Azure
</p>

<p align="center">
  <a href="https://github.com/AppliancesLk/frontend">Frontend</a> ·
  <a href="https://github.com/AppliancesLk/infra">Infrastructure</a> ·
  <a href="https://github.com/orgs/AppliancesLk/projects/1/views/1">Project Board</a> ·
  <a href="https://github.com/AppliancesLk">GitHub Organization</a>
</p>

---

## Overview

**Appliances.lk** is a single-vendor platform for selling mobile devices and accessories and managing device-repair services. This repository contains the **NestJS backend**, which provides the REST APIs, business logic, persistence, security controls, real-time communication, and third-party integrations for the React frontend.

The project was developed for **SENG 34213 — System Development Project**, Software Engineering Teaching Unit, Faculty of Science, University of Kelaniya, Sri Lanka.

### Core capabilities

- **Identity:** registration, email verification, login/logout, password reset, session management and `CUSTOMER` / `REPAIRER` / `ADMIN` authorization.
- **Catalog and shopping:** categories, products, product images, reviews, cart, checkout, orders and order events.
- **Payments and loyalty:** PayHere integration, Cash on Delivery workflows, loyalty earning/redemption.
- **Repair services:** customer repair requests, administrator review, repairer assignment and repair progress tracking.
- **Customer communication:** Socket.IO live support, notifications and transactional emails.
- **AI and storefront:** Gemini product assistant, AI conversation history, banners, promotions and seasonal themes.
- **Storage and operations:** local or Azure Blob product-image storage, database migrations, health checks and container deployment.

> **Payment environment:** The recorded Azure production configuration uses **PayHere sandbox mode**; it is not a claim of live payment settlement.

## Tech stack

| Area | Technology |
|---|---|
| Runtime / API | Node.js 24 (production container), NestJS, TypeScript |
| Database / ORM | PostgreSQL 16 in production, TypeORM |
| Real-time | Socket.IO |
| Authentication | bcrypt, database-backed revocable sessions, HTTP-only cookies, NestJS guards |
| Payments | PayHere |
| AI | Google Gemini API |
| Email | Gmail-based email integration |
| Product images | Local storage (development) / Azure Blob Storage (cloud) |
| Containers / hosting | Docker, Azure Container Apps, Azure Container Registry |
| Infrastructure / monitoring | Terraform, Azure Log Analytics |
| Testing | Jest; API integration and E2E test suites |
| CI/CD | GitHub Actions |

## Architecture

```text
React frontend (browser)
          |
          | HTTPS / REST JSON and Socket.IO
          v
Nginx frontend proxy (/api, /socket.io) [cloud]
          |
          v
NestJS controllers + authentication/role guards
          |
          v
Domain services (auth, products, cart, orders, repairs, chat, AI, ...)
          |
          +---- TypeORM ----> PostgreSQL
          +----------------> Azure Blob Storage / local uploads
          +----------------> PayHere / Gemini / email provider
```

The service is a **layered modular monolith**. The database schema is maintained with **TypeORM migrations** (`synchronize: false`), not with automatic schema synchronization.

---

## 1. Prerequisites for local development

Install:

- **Node.js** and npm. The deployed Docker image uses Node.js **24**; using Node.js 24 locally is recommended for parity.
- **PostgreSQL**, running locally and accessible to your account.
- **Git**.
- Optional: **pgAdmin** or `psql` to create/inspect the database.
- Optional: **Docker Desktop** for container testing.

On Windows PowerShell, check your tools:

```powershell
node --version
npm --version
git --version
psql --version    # Optional: works if PostgreSQL tools are on PATH
```

## 2. Clone and install

In PowerShell:

```powershell
git clone https://github.com/AppliancesLk/backend.git
cd backend
npm ci
```

`npm ci` installs the dependencies described by `package-lock.json`. For an existing local checkout, you can instead use:

```powershell
cd "E:\Design Project UNI\backend"
npm ci
```

## 3. Configure environment variables

Copy the supplied example and edit it **locally**:

```powershell
Copy-Item .env.example .env
notepad .env
```

Use your own local credentials. The following is an **illustrative development configuration**, not a set of real credentials:

```dotenv
# Server and frontend
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# Local PostgreSQL
DB_HOST=localhost
DB_PORT=5430
DB_USERNAME=postgres
DB_PASSWORD=replace_with_your_local_postgres_password
DB_NAME=appliances_lk
DB_SSL=false

# Auth and sessions
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1d
SESSION_TTL_SECONDS=86400

# Email (configure valid values if testing email functionality)
EMAIL_PROVIDER=gmail
EMAIL_USER=your_account@example.com
EMAIL_APP_PASSWORD=replace_with_email_app_password
EMAIL_FROM_NAME=Appliances.lk
EMAIL_FROM_ADDRESS=your_account@example.com
EMAIL_ASSET_BASE_URL=http://localhost:3000

# Gemini (configure when testing AI functionality)
GEMINI_API_KEY=replace_with_your_gemini_api_key
GEMINI_MODEL=gemini-3.5-flash-lite

# PayHere sandbox (configure when testing payments)
PAYHERE_MERCHANT_ID=replace_with_sandbox_merchant_id
PAYHERE_MERCHANT_SECRET=replace_with_sandbox_merchant_secret
PAYHERE_MODE=sandbox

# Product image storage
STORAGE_MODE=local
PRODUCT_IMAGE_CONTAINER=product-images
PRODUCT_IMAGE_MAX_BYTES=5242880
```

**Configuration notes**

- The project's earlier Windows local setup used **PostgreSQL port `5430`**. Change `DB_PORT` to `5432` or your actual local port as appropriate.
- `STORAGE_MODE=local` is suitable for local development. For cloud storage, the implementation also supports `STORAGE_MODE=cloud` with `STORAGE_ACCOUNT_URL` and Azure identity configuration (`AZURE_CLIENT_ID` when a user-assigned identity is used).
- The `.env.example` in your checkout is the source of truth for configuration keys; compare it with this example if the application changes.
- **Never commit `.env`, passwords, tokens, production secrets, or real test-account passwords.** Use GitHub Secrets / Azure Container Apps secrets for deployment.

## 4. Create the PostgreSQL database

Start your local PostgreSQL server. In pgAdmin, connect to your **local** PostgreSQL instance and create a database named:

```sql
CREATE DATABASE appliances_lk;
```

Alternatively, if the `psql` executable is available and the database doesn't already exist:

```powershell
psql -h localhost -p 5430 -U postgres -d postgres -c 'CREATE DATABASE appliances_lk;'
```

The project uses UUIDs. Its TypeORM initialization/migration workflow issues:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Your local PostgreSQL role must have permission to enable this extension. In Azure PostgreSQL Flexible Server, the `uuid-ossp` extension must be allowed through the `azure.extensions` server configuration before migrations create it.

## 5. Run database migrations

**Do this before starting the API against a new local database.** The backend uses TypeORM migrations, not `synchronize: true`.

```powershell
npm run migration:run
```

The verified package script invokes TypeORM using `src/database/data-source.ts`. It creates/updates tables and keeps migration history in the `migrations` table.

Check migration status (if the script is present in your current `package.json`; otherwise use the TypeORM CLI):

```powershell
npm run typeorm -- migration:show -d src/database/data-source.ts
```

**Safety:** Check that `DB_HOST`, `DB_PORT`, and `DB_NAME` point to **your local development database** before any migration or seeding command. Never run schema reset, automatic synchronization, or seed scripts blindly against staging or production.

For the detailed migration workflow, see [`docs/database-migrations.md`](docs/database-migrations.md).

## 6. Start the backend

```powershell
npm run start:dev
```

The development server normally listens at:

**http://localhost:3000**

Verify PostgreSQL connectivity in a second PowerShell window:

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/health/database" -Method Get
```

Expected response:

```json
{
  "status": "ok",
  "database": "connected"
}
```

To stop the development server, press **Ctrl+C** in its terminal.

### Run the frontend alongside the backend

Open a **second terminal**:

```powershell
cd "E:\Design Project UNI\frontend"
npm ci
npm run dev
```

Vite normally serves the frontend at **http://localhost:5173**. Configure the frontend's development API URL/proxy to target `http://localhost:3000` and ensure `FRONTEND_URL` matches the browser origin.

## 7. Production-style local build

```powershell
npm run build
```

The build emits JavaScript into `dist/`. After building, use the start command provided by your current `package.json` (typically `npm run start:prod` for NestJS):

```powershell
npm run start:prod
```

Run `npm run` to see all available scripts and confirm the exact production start script in your checkout.

## 8. Testing and quality checks

Recorded Sprint 8 baseline:

| Test evidence | Result |
|---|---:|
| Backend Jest test suites | 28 passed |
| Backend Jest tests | 382 passed |
| Backend overall line coverage (recorded report) | 60.04% |
| Project-wide documented test cases | 82 total: 67 Pass, 15 Blocked |

Run backend unit tests:

```powershell
npm test -- --runInBand
```

Run coverage if the script exists in your checkout:

```powershell
npm run test:cov
```

Run the available build/lint/test scripts from `package.json`:

```powershell
npm run
npm run build
```

The `test/` directory also contains API integration and E2E test files. Read their setup requirements before running them; some need a dedicated test database, local server, or integration credentials. **Do not point integration tests at the production database.**

Coverage percentages reflect the scope of the retained test run and do not automatically establish the university guideline's new-code coverage target.

## 9. Local database seed scripts (optional)

The repository contains scripts such as:

```text
scripts/seed-admin.cjs
scripts/seed-catalog.cjs
scripts/preview-emails.cjs
scripts/test-email.cjs
```

These are **optional developer utilities**, not required on every startup. Inspect each script's required environment variables and whether it inserts, updates, or overwrites existing data **before running it**, especially `seed-admin.cjs`.

Never publish seeded administrator passwords in the README. Use a dedicated local/demo account and store real login details securely outside Git.

## 10. Docker

Build the backend image:

```powershell
docker build -t applianceslk-backend:local .
```

**Important Docker networking detail:** Inside Docker, `localhost` refers to the container, **not** your Windows PostgreSQL server. To connect a Docker container to PostgreSQL running on your Windows machine, make a local Docker-specific env file with:

```dotenv
DB_HOST=host.docker.internal
DB_PORT=5430
```

Include the other required variables in `.env.docker` (do not commit it), and run:

```powershell
docker run --rm -p 3000:3000 --env-file .env.docker applianceslk-backend:local
```

For this to work, PostgreSQL must accept connections from Docker Desktop and the database must already have the expected schema. If no database is available outside the container, use a dedicated local Docker PostgreSQL service instead.

The production Docker image runs the compiled NestJS app on port `3000`; the image's built-in health check targets `/health/database`.

For additional Docker notes, see [`docs/docker.md`](docs/docker.md).

## 11. API and module documentation

Detailed repository documentation is maintained in the [`docs/`](docs/) directory.

| Topic | Documentation |
|---|---|
| Backend overview | [`APPLIANCES_BACKEND_GUIDE.md`](docs/APPLIANCES_BACKEND_GUIDE.md) |
| Authentication | [`AUTHENTICATION.md`](docs/AUTHENTICATION.md) |
| Admin user management | [`ADMIN_MANAGEMENT.md`](docs/ADMIN_MANAGEMENT.md) |
| Database migrations | [`database-migrations.md`](docs/database-migrations.md) |
| Catalog / categories / products | [`catalog-api.md`](docs/catalog-api.md) |
| Shopping cart | [`cart-api.md`](docs/cart-api.md) |
| Checkout | [`checkout-api.md`](docs/checkout-api.md) |
| Payments | [`payments-api.md`](docs/payments-api.md) |
| Orders | [`orders-api.md`](docs/orders-api.md) |
| Repairs | [`repairs-api.md`](docs/repairs-api.md) |
| Live support | [`LIVE_CHAT.md`](docs/LIVE_CHAT.md) |
| Notifications | [`NOTIFICATIONS.md`](docs/NOTIFICATIONS.md) |
| Promotions | [`promotions.md`](docs/promotions.md) |
| Seasonal storefront themes | [`seasonal-themes.md`](docs/seasonal-themes.md) |
| Product experience / reviews | [`product-experience.md`](docs/product-experience.md) |
| Banners | [`banners-api.md`](docs/banners-api.md) |

### Health check

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health/database` | Confirm API-to-PostgreSQL connectivity |

Other routes, request bodies, and authentication rules should be taken from their corresponding module docs and controllers rather than guessed from this overview.

---

## 12. Azure deployments

### Development / staging

- API: https://appliances-api-dev.graysky-2e2a33e6.centralindia.azurecontainerapps.io
- Frontend: https://appliances-web-dev.graysky-2e2a33e6.centralindia.azurecontainerapps.io
- Resource group: `rg-appliances-dev`
- Container registry: `applianceslkdevacr.azurecr.io`

### Production

- API: https://appliances-api-prod.nicehill-aa13b60f.centralindia.azurecontainerapps.io
- Frontend: https://appliances-web-prod.nicehill-aa13b60f.centralindia.azurecontainerapps.io
- Resource group: `rg-appliances-prod`
- Container App: `appliances-api-prod`
- PostgreSQL server: `applianceslk-pg-prod`
- Database: `appliances_lk`
- Registry: `applianceslkprodacr.azurecr.io`
- Image release: `backend-app:v1.0.0`
- Product image storage: `applianceslkprod2026` / `product-images` (private Blob container)
- Infrastructure repository: https://github.com/AppliancesLk/infra

The production frontend reverse-proxies `/api` requests to the backend. Verified health check paths:

- Direct API: `https://appliances-api-prod.nicehill-aa13b60f.centralindia.azurecontainerapps.io/health/database`
- Via frontend: `https://appliances-web-prod.nicehill-aa13b60f.centralindia.azurecontainerapps.io/api/health/database`

The latest recorded deployment checks returned `{ "status": "ok", "database": "connected" }` from both paths. This is connectivity evidence, **not** proof that every feature or security requirement has been verified.

## 13. Troubleshooting

| Problem | Check / fix |
|---|---|
| `ECONNREFUSED` / connection timeout | Check PostgreSQL service, `.env` host/port, and local firewall. This project previously used port `5430`. |
| `database ... does not exist` | Create `appliances_lk` or update `DB_NAME`. |
| `relation ... does not exist` | Run pending TypeORM migrations against the correct **local** database. |
| `function uuid_generate_v4() does not exist` | Enable/allow `uuid-ossp`, then rerun the migration. |
| Frontend gets CORS/401 errors | Check `FRONTEND_URL`, API URL, cookie credentials and session/login state. |
| Uploads fail | Check `STORAGE_MODE`, local file permissions, file size and/or Azure identity/storage permissions. |
| Email fails | Check Gmail app-password settings and email provider environment variables; do not log secrets. |
| Gemini requests fail | Check API-key configuration, API access and model availability. |
| PayHere callback fails | Check sandbox credentials, callback configuration and public reachability of callback endpoints. |
| Docker cannot connect to Windows PostgreSQL | Use `host.docker.internal`, not `localhost`, in the container env. |

## 14. Security and development guidelines

- Never commit `.env`, secrets, credentials, tokens, database dumps or Terraform state.
- Keep production and test databases separate; do not run destructive migrations/seeds on production.
- Use backend guards/RBAC for authorization, not merely hidden frontend buttons.
- Validate inputs and use TypeORM parameterized operations.
- Retain dependency/security scan evidence, and remediate high/critical vulnerabilities before release.
- The original university OWASP evidence identified additional checks for bcrypt cost, login-abuse controls, dependency scans and safe security logging; do not describe these as fully verified without fresh evidence.

## Project team

| Name | Student Number |
|---|---|
| G.G. Lakshitha Madushan | SE/2021/033 |
| H. Buddhika Madumali | SE/2021/042 |
| Praveen Dedigama | SE/2021/031 |
| Induwara Mihisara | SE/2021/025 |

**Course:** SENG 34213 — System Development Project  
**Faculty:** Faculty of Science  
**University:** University of Kelaniya, Sri Lanka  
**Project year:** 2026

---

<p align="center"><strong>Appliances.lk — Shop Smart · Repair Easy · Stay Connected</strong></p>

