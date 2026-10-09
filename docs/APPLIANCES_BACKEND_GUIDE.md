# Appliances.lk Backend – Setup, Database Migration & API Testing Guide

This guide explains how another developer—especially a frontend developer—can run the current backend, prepare the PostgreSQL database, apply migrations, and test the available authentication and authorization APIs.

It also summarizes the two latest backend pull requests covered by this guide:

- **PR #4** – Backend initialization and PostgreSQL connection  
  https://github.com/AppliancesLk/backend/pull/4
- **PR #6** – Authentication and RBAC foundation  
  https://github.com/AppliancesLk/backend/pull/6

---

## 1. Current Backend Stack

- **Framework:** NestJS
- **Language:** TypeScript
- **Database:** PostgreSQL
- **ORM:** TypeORM
- **Authentication:** JWT
- **Password Hashing:** bcrypt
- **Validation:** class-validator / class-transformer

Current roles:

```text
ADMIN
CUSTOMER
REPAIRER
```

Public registration currently creates a **CUSTOMER** account by default.

---

# 2. What the Latest Two Pull Requests Added

## PR #4 – Backend Initialization and PostgreSQL Connection

PR:

```text
https://github.com/AppliancesLk/backend/pull/4
```

Main work:

- Initialized the NestJS backend project
- Added PostgreSQL support
- Added TypeORM
- Added environment configuration
- Added `.env.example`
- Added database connectivity configuration
- Added a database health-check endpoint
- Verified the backend can connect to PostgreSQL

Database health endpoint:

```http
GET /health/database
```

Expected response:

```json
{
  "status": "ok",
  "database": "connected"
}
```

---

## PR #6 – Authentication and RBAC Foundation

PR:

```text
https://github.com/AppliancesLk/backend/pull/6
```

Main work:

- Added `User` entity
- Added PostgreSQL `users` table through TypeORM migration
- Added roles:
  - `ADMIN`
  - `CUSTOMER`
  - `REPAIRER`
- Added customer registration
- Added duplicate-email validation
- Added bcrypt password hashing
- Added login
- Added JWT access-token generation
- Added JWT authentication guard
- Added role metadata/decorator
- Added role-based authorization guard
- Added sample protected routes for testing authorization

---

# 3. Clone and Run the Backend

Clone the backend repository:

```bash
git clone https://github.com/AppliancesLk/backend.git
```

Move into the project:

```bash
cd backend
```

Switch to the integrated development branch:

```bash
git checkout develop
git pull origin develop
```

Install dependencies:

```bash
npm install
```

---

# 4. Environment Configuration

Create a `.env` file in the backend project root.

Example:

```env
PORT=3000

DB_HOST=localhost
DB_PORT=5430
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=appliances_lk

JWT_SECRET=replace_with_a_strong_secret
JWT_EXPIRES_IN=86400
```

> **Important:** `DB_PORT=5430` is the port used in the current local development setup. If your PostgreSQL server uses another port such as `5432`, update `DB_PORT` accordingly.

Do not commit `.env`.

The repository contains `.env.example` to show which variables are required.

---

# 5. PostgreSQL Setup

Make sure PostgreSQL is installed and running.

Create the project database:

```sql
CREATE DATABASE appliances_lk;
```

The initial user migration uses UUID generation. If required in your PostgreSQL installation, enable the extension:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Make sure this is executed inside the `appliances_lk` database.

---

# 6. Database Migration Workflow

The project uses:

```text
synchronize: false
```

This means TypeORM does **not** automatically create or modify database tables when the application starts.

Database schema changes are handled using migrations.

## Existing migration

The current migration creates:

```text
users
```

and the PostgreSQL enum:

```text
users_role_enum
```

with:

```text
ADMIN
CUSTOMER
REPAIRER
```

It also creates TypeORM's migration-tracking table:

```text
migrations
```

## Run pending migrations

From the backend project root:

```bash
npm run migration:run -- -d src/database/data-source.ts
```

After running the migration, PostgreSQL should contain:

```text
public
├── migrations
└── users
```

The `users` table currently contains:

```text
id
email
passwordHash
role
isActive
createdAt
updatedAt
```

## Generate a future migration

When an entity changes:

```bash
npm run migration:generate -- src/database/migrations/MigrationName -d src/database/data-source.ts
```

Example:

```bash
npm run migration:generate -- src/database/migrations/AddUserProfileFields -d src/database/data-source.ts
```

Then apply it:

```bash
npm run migration:run -- -d src/database/data-source.ts
```

## Revert the latest migration

```bash
npm run migration:revert -- -d src/database/data-source.ts
```

---

# 7. Start the Backend

Development mode:

```bash
npm run start:dev
```

The backend should start on:

```text
http://localhost:3000
```

---

# 8. API Endpoints Available Now

## 8.1 Database Health Check

```http
GET /health/database
```

No authentication required.

Expected:

```json
{
  "status": "ok",
  "database": "connected"
}
```

---

# 9. Authentication APIs

## 9.1 Register Customer

```http
POST /auth/register
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "email": "customer@test.com",
  "password": "Password123"
}
```

Successful response:

```json
{
  "id": "generated-user-uuid",
  "email": "customer@test.com",
  "role": "CUSTOMER"
}
```

Typical status:

```text
201 Created
```

### Duplicate email

Sending the same email again returns:

```json
{
  "message": "Email is already registered",
  "error": "Conflict",
  "statusCode": 409
}
```

### Important frontend note

The frontend should **not** send a role during public registration.

Public registration automatically creates:

```text
CUSTOMER
```

This prevents a user from registering themselves as `ADMIN` or `REPAIRER`.

---

## 9.2 Login

```http
POST /auth/login
```

Headers:

```http
Content-Type: application/json
```

Body:

```json
{
  "email": "customer@test.com",
  "password": "Password123"
}
```

Successful response:

```json
{
  "accessToken": "eyJ...",
  "user": {
    "id": "generated-user-uuid",
    "email": "customer@test.com",
    "role": "CUSTOMER"
  }
}
```

The frontend should save the returned access token according to the application's agreed authentication strategy and send it with protected requests.

### Invalid credentials

Example response:

```json
{
  "message": "Invalid email or password",
  "error": "Unauthorized",
  "statusCode": 401
}
```

---

# 10. How to Send the JWT from the Frontend

Protected APIs expect an Authorization header:

```http
Authorization: Bearer <access-token>
```

Example:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

JavaScript / React example:

```ts
const response = await fetch('http://localhost:3000/auth/profile', {
  method: 'GET',
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});
```

Axios example:

```ts
const response = await axios.get(
  'http://localhost:3000/auth/profile',
  {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  },
);
```

---

# 11. Protected Profile Endpoint

```http
GET /auth/profile
```

Requires:

```http
Authorization: Bearer <access-token>
```

Example successful response:

```json
{
  "sub": "user-uuid",
  "email": "customer@test.com",
  "role": "CUSTOMER",
  "iat": 1791462704,
  "exp": 1791549104
}
```

Meaning:

```text
sub   = authenticated user ID
email = authenticated user email
role  = user role
iat   = token issued-at time
exp   = token expiration time
```

Without a valid token, the request returns:

```text
401 Unauthorized
```

---

# 12. Authorization / RBAC Test Endpoints

These endpoints currently exist only to verify that the authorization foundation works.

They are not real business-domain APIs.

## Any authenticated user

```http
GET /auth/test/authenticated
```

Requires any valid JWT.

Expected:

```json
{
  "message": "Authenticated user access granted"
}
```

## Customer-only

```http
GET /auth/test/customer
```

Allowed role:

```text
CUSTOMER
```

Expected for a customer:

```json
{
  "message": "Customer access granted"
}
```

## Admin-only

```http
GET /auth/test/admin
```

Allowed role:

```text
ADMIN
```

If a CUSTOMER token is used:

```json
{
  "statusCode": 403,
  "message": "You do not have permission to access this resource",
  "error": "Forbidden"
}
```

## Repairer-only

```http
GET /auth/test/repairer
```

Allowed role:

```text
REPAIRER
```

A CUSTOMER token should receive:

```text
403 Forbidden
```

## Admin or Repairer

```http
GET /auth/test/admin-or-repairer
```

Allowed roles:

```text
ADMIN
REPAIRER
```

A CUSTOMER token should receive:

```text
403 Forbidden
```

---

# 13. Authentication vs Authorization

## Authentication

Authentication answers:

```text
Who is this user?
```

Handled using:

```text
JWT
JwtAuthGuard
```

Flow:

```text
Login
  ↓
JWT generated
  ↓
Frontend sends Bearer token
  ↓
JwtAuthGuard verifies token
  ↓
Authenticated user is attached to request
```

## Authorization

Authorization answers:

```text
Is this authenticated user allowed to perform this action?
```

Handled using:

```text
@Roles(...)
RolesGuard
```

Example:

```text
CUSTOMER token
      ↓
JWT valid
      ↓
Route requires ADMIN
      ↓
RolesGuard compares roles
      ↓
403 Forbidden
```

---

# 14. Frontend Integration Flow

For the current authentication foundation, a frontend developer should implement this flow:

```text
Registration Page
      ↓
POST /auth/register
      ↓
Registration successful
      ↓
Login Page
      ↓
POST /auth/login
      ↓
Receive accessToken + user
      ↓
Use accessToken for protected API requests
```

For protected requests:

```text
Frontend
   ↓
Authorization: Bearer <token>
   ↓
Backend JwtAuthGuard
   ↓
RolesGuard when role restrictions exist
   ↓
Controller
```

---

# 15. Suggested Frontend API Service Structure

Example:

```text
src/
└── services/
    ├── auth.service.ts
    └── api.ts
```

Example auth service:

```ts
import axios from 'axios';

const API_URL = 'http://localhost:3000';

export const register = (email: string, password: string) => {
  return axios.post(`${API_URL}/auth/register`, {
    email,
    password,
  });
};

export const login = (email: string, password: string) => {
  return axios.post(`${API_URL}/auth/login`, {
    email,
    password,
  });
};
```

Protected request example:

```ts
export const getProfile = (accessToken: string) => {
  return axios.get(`${API_URL}/auth/profile`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
};
```

---

# 16. Quick Test Checklist for Another Developer

After cloning the backend:

```text
[ ] npm install
[ ] Create .env
[ ] Create/access appliances_lk PostgreSQL database
[ ] Enable uuid-ossp if required
[ ] Run migrations
[ ] npm run start:dev
[ ] GET /health/database returns connected
[ ] POST /auth/register creates a customer
[ ] Duplicate registration returns 409
[ ] POST /auth/login returns JWT
[ ] Wrong password returns 401
[ ] GET /auth/profile without token returns 401
[ ] GET /auth/profile with token succeeds
[ ] CUSTOMER can access /auth/test/customer
[ ] CUSTOMER cannot access /auth/test/admin
[ ] CUSTOMER cannot access /auth/test/repairer
```

---

# 17. Current Scope Limitations

The current backend foundation does **not yet** implement:

- Products
- Categories
- Inventory
- Real admin product management
- Real repairer workflows
- Admin dashboard APIs

The current authorization test endpoints exist only to verify the RBAC foundation before these business modules are added.

---

# 18. Stage 1 Target Flow

Customer target:

```text
Register
↓
Login
↓
Browse Products
↓
View Product
```

Admin target:

```text
Login
↓
Add Product
↓
Edit Product
↓
Manage Stock
```

Current progress:

```text
✅ Backend initialization
✅ PostgreSQL connection
✅ TypeORM migration foundation
✅ User table
✅ CUSTOMER / ADMIN / REPAIRER roles
✅ Registration
✅ Login
✅ JWT authentication
✅ RBAC authorization foundation

Next:
Categories
↓
Products
↓
Inventory
↓
Basic Admin APIs
```

---

# 19. Pull Requests

## Backend Initialization

```text
https://github.com/AppliancesLk/backend/pull/4
```

## Authentication and RBAC Foundation

```text
https://github.com/AppliancesLk/backend/pull/6
```

---

## Notes for Team Members

When a new migration is added by another backend developer, always pull the latest changes and run:

```bash
npm install
npm run migration:run -- -d src/database/data-source.ts
```

before starting development.

Never enable:

```text
synchronize: true
```

as a replacement for the migration workflow in the shared project.

Never commit:

```text
.env
```

or real database/JWT secrets.
