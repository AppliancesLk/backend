# Authentication

Frontend pages use React Context (`useAuth`) and cookie sessions. Shop routes `/products` and `/products/:id` remain public. `/account` needs a session; `/admin` and `/repairer` additionally require their respective roles. The navigation provides account access and sign-out on every page. The admin workspace includes catalog and inventory management; the repairer workspace remains a placeholder for future repair features.

## Local setup

1. Configure `backend/.env` from `.env.example` with your database settings.
2. From backend run `npm run migration:run -- -d src/database/data-source.ts`.
3. Run `npm run start:dev` in backend, and `npm run dev` in frontend.
4. Open http://localhost:5173/register and create a customer account.

Use localhost consistently (do not mix it with 127.0.0.1). `FRONTEND_URL` defaults to http://localhost:5173; frontend `VITE_API_URL` defaults to http://localhost:3000. Set both to match deployment. Production requires HTTPS and `NODE_ENV=production`, which enables Secure cookies. This configuration assumes frontend and API are on the same site (for example shop.example.com and api.example.com); unrelated domains require a different cookie and CSRF strategy.

## Roles and existing accounts

Registration always creates CUSTOMER accounts; role fields supplied by a client are rejected. Only a trusted database operator should assign ADMIN or REPAIRER, for example using a parameterized update targeting a verified account ID. There is no public promotion endpoint. The explicit development admin seed is documented in ADMIN_MANAGEMENT.md. Existing accounts receive a deterministic `user_` username during migration and can still sign in using their existing email and password.

Use `useAuth()` to access `user`, `loading`, `error`, `signIn`, `signUp`, `signOut`, `refresh`, and `hasRole`. Nest new protected routes under `ProtectedRoute`, optionally passing `roles`. Always enforce permissions in the backend using the existing authentication and roles guards too.

## API

- POST /auth/register: `{ username, email, password }`; signs in and returns `{ user }`.
- POST /auth/login: `{ username, password }`; username may also be an email; returns `{ user }`.
- GET /auth/profile: current public user; 401 when signed out or expired.
- POST /auth/logout: revokes this session and clears its cookie; safe to repeat.

Send requests with cookies (`withCredentials: true`) and `X-Requested-With: XMLHttpRequest` on mutations. Browser Origin must match FRONTEND_URL. CORS allows credentials only from that configured origin. The session token is never returned in JSON or stored in localStorage. Sessions store SHA-256 hashes, expire after SESSION_TTL_SECONDS (default 86400), and are checked against the current active user and role on each request. Expired records are removed on authentication or new sign-in. Passwords are bcrypt hashed; usernames and new email addresses are normalized to lowercase.

Login/registration are limited to 20 requests per IP per 15 minutes in one server process. A multi-instance deployment needs a shared rate-limit store and correctly configured trusted proxies. Bearer JWT authentication has been replaced by cookie sessions. JWT_SECRET and JWT_EXPIRES_IN are no longer used by this auth flow.

## Verification

`npm run test:auth:integration` builds the backend and checks real HTTP requests against the configured database, including role denial, role updates, session restoration, revocation, expiry, deactivation, CSRF rejection, public browsing and registration role injection. It creates one random temporary account and deletes it in a finally block. Run it against a development database.

`npm test -- --runInBand --testPathPatterns=auth` runs auth unit tests. Frontend: `npm run build` and `npm run lint`.

Security references: [Nest CORS](https://docs.nestjs.com/security/cors), [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

## CORS troubleshooting

Cookie requests require `Access-Control-Allow-Credentials: true` and an exact allowed origin. Preflight must allow `Content-Type` and `X-Requested-With`. `configureApp` registers CORS before browser security so even authentication/CSRF failures include readable CORS headers. If the response omits credentials or only permits Content-Type/Authorization, the server is running an old build: stop it and restart with `npm run start:dev`. `npm run start` does not watch source changes, and rebuilding files does not reload a running Node process.

The frontend development server uses port 5173 with strictPort enabled so it cannot silently move to a different origin. If you deliberately use another origin, update FRONTEND_URL in backend/.env and restart the backend. Use localhost consistently on both sides for local cookie sessions.

Auth page entry points are `pages/Auth/Login/index.tsx` and `pages/Auth/Register/index.tsx`, with shared auth-local form components/hooks. Customer profile and admin dashboard use separate page folders and layouts. Auth copy, routes, and backend-aligned roles are centralized in translations and constants, following AGENTS.md.
