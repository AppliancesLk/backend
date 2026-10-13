# Appliances.lk Backend – Setup, Database Migration & API Testing Guide

This guide explains how another developer—especially a frontend developer—can run the current backend, prepare the PostgreSQL database, apply migrations, and test the available authentication, authorization, category, and product APIs.

It reflects the current backend implementation after:
- **PR #4** – Backend initialization and PostgreSQL connection
- **PR #6** – Authentication and RBAC foundation
- **Current feature work** – Product and Category management foundation on `feature/product-category-management`

---

# 1. Current Backend Stack

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

Public registration creates a **CUSTOMER** account by default.

---

# 2. Current Backend Features

## 2.1 Backend Initialization

Implemented:
- NestJS backend project
- PostgreSQL connection
- TypeORM configuration
- Environment configuration
- `.env.example`
- Database health endpoint
- Migration-based schema management

Health endpoint:

```http
GET /health/database
```

Expected:

```json
{
  "status": "ok",
  "database": "connected"
}
```

## 2.2 Authentication and RBAC

Implemented:
- `User` entity
- `users` table
- `ADMIN`, `CUSTOMER`, `REPAIRER` roles
- Customer registration
- Duplicate email handling
- bcrypt password hashing
- Login
- JWT access token
- JWT authentication guard
- `@Roles(...)` decorator
- Roles guard
- Protected profile endpoint
- RBAC test endpoints

## 2.3 Categories

Implemented:
- `Category` entity
- Self-referencing parent-child relationship
- Public category list
- Public category detail
- ADMIN-only category creation
- ADMIN-only category update
- Parent-category validation

Current Category fields:

```text
categoryID : UUID
name       : string
isActive   : boolean
parentID   : UUID | null
```

Relationship:

```text
Category
   1
   │
   └── many child Categories
```

Example:

```text
Electronics
└── Smart Televisions
```

## 2.4 Products

Implemented:
- `Product` entity
- Product-to-Category relationship
- Public product list
- Public product detail
- ADMIN-only product creation
- ADMIN-only product update
- Category existence validation
- Duplicate SKU validation
- Flexible JSONB specifications
- Multiple image URLs

Current Product fields:

```text
productID      : UUID
name           : string
SKU            : string (unique)
price          : decimal(12,2)
stockQty       : integer
images         : string[]
specifications : JSONB | null
isActive       : boolean
categoryID     : UUID
```

`stockQty` currently defaults to `0`. Inventory-changing business logic is intentionally left for the Inventory ticket.

---

# 3. Repository and Branch Workflow

Clone:

```bash
git clone https://github.com/AppliancesLk/backend.git
cd backend
```

Switch to the integration branch:

```bash
git checkout develop
git pull origin develop
```

Install dependencies:

```bash
npm install
```

For the current Product + Category work, the feature branch is:

```text
feature/product-category-management
```

---

# 4. Environment Configuration

Create `.env` in the backend project root.

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

Important:
- Current local PostgreSQL port is `5430`.
- If your PostgreSQL uses another port, update `DB_PORT`.
- Never commit `.env`.
- Never commit real database or JWT secrets.

---

# 5. PostgreSQL Setup

Create the database:

```sql
CREATE DATABASE appliances_lk;
```

UUID generation is required:

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

Run it inside the `appliances_lk` database.

---

# 6. Database Migration Workflow

The project uses:

```text
synchronize: false
```

Do not replace the migration workflow with `synchronize: true`.

Current migrations create:

```text
users
categories
products
migrations
```

The current database schema should include:

```text
public
├── migrations
├── users
├── categories
└── products
```

## 6.1 User migration

Creates:
- `users`
- `users_role_enum`

User roles:

```text
ADMIN
CUSTOMER
REPAIRER
```

## 6.2 Product and Category migration

Migration name:

```text
CreateProductsAndCategories
```

It creates:

```text
categories
products
```

Important foreign keys:

```text
products.categoryID
    → categories.categoryID
    ON DELETE RESTRICT

categories.parentID
    → categories.categoryID
    ON DELETE SET NULL
```

This means:
- every Product must belong to a Category;
- a Category cannot be deleted while Products still reference it;
- deleting a parent Category does not delete its child Categories; their `parentID` becomes `NULL`.

## 6.3 Run pending migrations

```bash
npm run migration:run -- -d src/database/data-source.ts
```

## 6.4 Generate a migration

```bash
npm run migration:generate -- src/database/migrations/MigrationName -d src/database/data-source.ts
```

Example:

```bash
npm run migration:generate -- src/database/migrations/CreateProductsAndCategories -d src/database/data-source.ts
```

## 6.5 Revert latest migration

```bash
npm run migration:revert -- -d src/database/data-source.ts
```

---

# 7. Start the Backend

```bash
npm run start:dev
```

Default local URL:

```text
http://localhost:3000
```

---

# 8. API Endpoints Available Now

## 8.1 Health

```http
GET /health/database
```

Public.

## 8.2 Authentication

```http
POST /auth/register
POST /auth/login
GET  /auth/profile
```

## 8.3 RBAC Test Endpoints

```http
GET /auth/test/authenticated
GET /auth/test/customer
GET /auth/test/admin
GET /auth/test/repairer
GET /auth/test/admin-or-repairer
```

## 8.4 Category APIs

```http
GET   /categories
GET   /categories/:id
POST  /categories
PATCH /categories/:id
```

Permissions:

```text
GET   /categories       → Public
GET   /categories/:id   → Public
POST  /categories       → ADMIN only
PATCH /categories/:id   → ADMIN only
```

## 8.5 Product APIs

```http
GET   /products
GET   /products/:id
POST  /products
PATCH /products/:id
```

Permissions:

```text
GET   /products       → Public
GET   /products/:id   → Public
POST  /products       → ADMIN only
PATCH /products/:id   → ADMIN only
```

---

# 9. Authentication APIs

## 9.1 Register Customer

```http
POST /auth/register
Content-Type: application/json
```

Body:

```json
{
  "email": "customer@test.com",
  "password": "Password123"
}
```

Typical successful response:

```json
{
  "id": "generated-user-uuid",
  "email": "customer@test.com",
  "role": "CUSTOMER"
}
```

Public registration must not accept a requested role.

## 9.2 Login

```http
POST /auth/login
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

Protected requests use:

```http
Authorization: Bearer <access-token>
```

---

# 10. Testing an ADMIN Locally

Public registration creates only `CUSTOMER`.

For local development only, a test user can be promoted manually:

```sql
UPDATE users
SET role = 'ADMIN'
WHERE email = 'admin@test.com';
```

Then login again.

Important: the role is embedded in the JWT at login time, so after changing the database role you must obtain a new token.

---

# 11. Category API Guide

## 11.1 Create top-level Category

```http
POST /categories
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json
```

Body:

```json
{
  "name": "Electronics"
}
```

Typical response:

```json
{
  "categoryID": "generated-uuid",
  "name": "Electronics",
  "isActive": true,
  "parent": null
}
```

## 11.2 Create child Category

```json
{
  "name": "Smart Televisions",
  "parentID": "PARENT_CATEGORY_UUID"
}
```

## 11.3 List Categories

```http
GET /categories
```

Public.

## 11.4 Get one Category

```http
GET /categories/:id
```

Public.

## 11.5 Update Category

```http
PATCH /categories/:id
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json
```

Example:

```json
{
  "name": "Smart Televisions"
}
```

Partial updates are supported.

---

# 12. Product API Guide

## 12.1 Create Product

```http
POST /products
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json
```

Example:

```json
{
  "name": "Samsung 55 Inch 4K Smart TV",
  "SKU": "TV-SAM-55-001",
  "price": 249999.99,
  "categoryID": "CATEGORY_UUID",
  "images": [
    "https://example.com/tv-front.jpg",
    "https://example.com/tv-side.jpg"
  ],
  "specifications": {
    "screenSize": "55 inch",
    "resolution": "4K",
    "smartTV": true
  }
}
```

Behavior:
- validates DTO;
- checks duplicate SKU;
- checks category exists;
- defaults `stockQty` to `0`;
- saves Product through TypeORM;
- returns Product with Category relation.

## 12.2 List Products

```http
GET /products
```

Public.

Example shape:

```json
[
  {
    "productID": "product-uuid",
    "name": "Samsung 55 Inch 4K Smart TV",
    "SKU": "TV-SAM-55-001",
    "price": "249999.99",
    "stockQty": 0,
    "images": [],
    "specifications": {},
    "isActive": true,
    "category": {
      "categoryID": "category-uuid",
      "name": "Smart Televisions",
      "isActive": true
    }
  }
]
```

Note: PostgreSQL `numeric` values may be returned by TypeORM as strings on reads.

## 12.3 Get one Product

```http
GET /products/:id
```

Public.

## 12.4 Update Product

```http
PATCH /products/:id
Authorization: Bearer <ADMIN_TOKEN>
Content-Type: application/json
```

Example:

```json
{
  "name": "LG 260L Frost Free Double Door Refrigerator",
  "price": 179999.99
}
```

Only supplied fields are changed.

If `categoryID` is changed, the target Category is validated before saving.

---

# 13. Current Validation and Error Behavior

Confirmed behavior:

```text
No JWT on protected POST/PATCH
→ 401 Unauthorized

CUSTOMER JWT on ADMIN-only POST/PATCH
→ 403 Forbidden

Duplicate Product SKU
→ 409 Conflict

Malformed/non-UUID categoryID
→ 400 Bad Request

Valid UUID but Category does not exist
→ 404 Not Found

Unknown Product ID
→ 404 Not Found

Duplicate SKU during Product update
→ 409 Conflict
```

Example duplicate SKU response:

```json
{
  "message": "A product with this SKU already exists",
  "error": "Conflict",
  "statusCode": 409
}
```

Example missing Category:

```json
{
  "message": "Category not found",
  "error": "Not Found",
  "statusCode": 404
}
```

Example missing Product:

```json
{
  "message": "Product not found",
  "error": "Not Found",
  "statusCode": 404
}
```

---

# 14. Authentication vs Authorization

Authentication asks:

```text
Who is the user?
```

Handled by:
- JWT
- `JwtAuthGuard`

Authorization asks:

```text
Is this user allowed to perform this action?
```

Handled by:
- `@Roles(...)`
- `RolesGuard`

For ADMIN-only business APIs:

```text
Request
  ↓
JwtAuthGuard
  ↓
Valid JWT?
  ↓
RolesGuard
  ↓
ADMIN?
  ↓
Controller
  ↓
Service
  ↓
TypeORM
  ↓
PostgreSQL
```

---

# 15. Current Backend Architecture

```text
src/
├── auth/
├── categories/
│   ├── controllers/
│   ├── dto/
│   ├── entities/
│   ├── services/
│   └── categories.module.ts
├── common/
├── config/
├── database/
│   ├── migrations/
│   └── data-source.ts
├── products/
│   ├── controllers/
│   ├── dto/
│   ├── entities/
│   ├── services/
│   └── products.module.ts
└── users/
```

Business flow:

```text
Controller
   ↓
DTO validation
   ↓
Service
   ↓
Business validation
   ↓
TypeORM Repository
   ↓
PostgreSQL
```

Controllers should not contain database logic.

---

# 16. Frontend Integration Flow

## Customer

```text
Register
↓
Login
↓
GET /categories
↓
GET /products
↓
GET /products/:id
```

## Admin

```text
Login
↓
Receive ADMIN JWT
↓
POST /categories
↓
PATCH /categories/:id
↓
POST /products
↓
PATCH /products/:id
```

Every protected request sends:

```http
Authorization: Bearer <token>
```

---

# 17. Quick Test Checklist

```text
[ ] npm install
[ ] Create .env
[ ] Create/access appliances_lk database
[ ] Enable uuid-ossp if required
[ ] Run migrations
[ ] npm run start:dev

[ ] GET /health/database returns connected

[ ] POST /auth/register creates CUSTOMER
[ ] Duplicate registration returns 409
[ ] POST /auth/login returns JWT
[ ] Wrong password returns 401
[ ] GET /auth/profile without token returns 401
[ ] GET /auth/profile with token succeeds

[ ] GET /categories works publicly
[ ] GET /categories/:id works publicly
[ ] ADMIN can POST /categories
[ ] ADMIN can PATCH /categories/:id
[ ] CUSTOMER cannot POST/PATCH categories

[ ] GET /products works publicly
[ ] GET /products/:id works publicly
[ ] ADMIN can POST /products
[ ] ADMIN can PATCH /products/:id
[ ] CUSTOMER cannot POST/PATCH products

[ ] Duplicate Product SKU returns 409
[ ] Invalid UUID input returns 400
[ ] Missing Category returns 404
[ ] Missing Product returns 404
```

---

# 18. Current Scope Limitations

Not yet implemented:

- Inventory/stock management business logic
- Product deletion
- Category deletion
- Product image upload/storage service
- Cart
- Checkout
- Orders
- PayHere/payment integration
- Wishlist
- Reviews/ratings
- Recommendations
- Advanced filtering/search
- Analytics
- Final Admin UI
- Final Product Browse UI

The Product entity contains `stockQty`, but stock-management actions are intentionally deferred to the Inventory task.

---

# 19. Stage 1 Progress

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

✅ Category entity and migration
✅ Category public GET APIs
✅ Category ADMIN POST/PATCH APIs

✅ Product entity and migration
✅ Product public GET APIs
✅ Product ADMIN POST/PATCH APIs
✅ Category validation for Products
✅ Duplicate SKU validation
✅ Product/Category permission testing

Next:
Inventory
↓
Stock management
↓
Basic admin workflow completion
```

---

# 20. Pull Requests / Current Work

## Backend Initialization

```text
https://github.com/AppliancesLk/backend/pull/4
```

## Authentication and RBAC Foundation

```text
https://github.com/AppliancesLk/backend/pull/6
```

## Product and Category Management

Current feature branch:

```text
feature/product-category-management
```

This work should be reviewed, committed, pushed, and opened as a pull request into:

```text
develop
```

If it corresponds to GitHub issue #12, include:

```text
Closes #12
```

in the PR description.

---

# 21. Notes for Team Members

When another backend developer adds migrations:

```bash
git checkout develop
git pull origin develop
npm install
npm run migration:run -- -d src/database/data-source.ts
```

Never use:

```text
synchronize: true
```

as a replacement for shared migrations.

Never commit:

```text
.env
```

or real JWT/database secrets.

Before creating a PR:

```bash
git status
npm run start:dev
```

Confirm the backend starts without errors and manually test the affected endpoints.
