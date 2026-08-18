# Appliances.lk Backend Development & Architecture Framework

> **Purpose:** This document is the single backend development reference for developers and coding agents working on Appliances.lk.
>
> It defines the backend architecture, modular-monolith boundaries, NestJS conventions, database rules, validation, authentication/RBAC, logging, error handling, testing, migrations, security, API design, and coding-agent rules.
>
> The goal is to keep the backend consistent, maintainable, secure, and easy for all team members to understand even when multiple developers or AI coding agents work on different modules.

---

# 1. Current Backend Technology Stack

The backend must continue using the existing project stack:

- **Framework:** NestJS
- **Language:** TypeScript
- **Architecture:** Modular Monolith
- **Database:** PostgreSQL
- **ORM:** TypeORM
- **Authentication:** JWT
- **Password hashing:** bcrypt
- **Validation:** class-validator / class-transformer
- **Testing:** Jest
- **Database changes:** TypeORM migrations

Current roles:

```text
ADMIN
CUSTOMER
REPAIRER
```

Public registration creates:

```text
CUSTOMER
```

by default.

Do not introduce another backend framework, ORM, database, or authentication system unless the team explicitly agrees to an architectural change.

---

# 2. Core Architecture: Modular Monolith

Appliances.lk must be implemented as a **Modular Monolith**.

This means:

```text
One Backend Application
        ↓
Multiple Business Modules
        ↓
One Deployable Application
        ↓
Shared PostgreSQL Database
```

Examples of business modules:

```text
Authentication
Users
Categories
Products
Inventory
Cart
Orders
Payments
Repairs
Loyalty
Notifications
Chat
AI Support
```

The project must **not** be implemented as microservices at this stage.

---

# 3. What Modular Monolith Means in This Project

Each major business area should behave like an independent module inside the same NestJS application.

Example:

```text
Application
│
├── Auth Module
├── Users Module
├── Categories Module
├── Products Module
├── Inventory Module
├── Cart Module
├── Orders Module
├── Repairs Module
└── Notifications Module
```

Each module should:

- own its business logic
- own its entities where appropriate
- own its controllers
- own its services
- expose only what other modules actually need
- avoid directly reaching into another module's internal implementation

The goal is:

> **Strong internal module boundaries without the operational complexity of microservices.**

---

# 4. Recommended Backend Folder Structure

The existing backend currently contains `auth`, `users`, `common`, `config`, and `database`.

As the project grows, organize business modules consistently.

Recommended target structure:

```text
src/
│
├── app.module.ts
├── main.ts
│
├── modules/
│   ├── auth/
│   │   ├── controllers/
│   │   ├── decorators/
│   │   ├── dto/
│   │   ├── guards/
│   │   ├── services/
│   │   ├── strategies/
│   │   └── auth.module.ts
│   │
│   ├── users/
│   │   ├── entities/
│   │   ├── enums/
│   │   ├── dto/
│   │   ├── services/
│   │   └── users.module.ts
│   │
│   ├── categories/
│   │   ├── controllers/
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── services/
│   │   └── categories.module.ts
│   │
│   ├── products/
│   │   ├── controllers/
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── services/
│   │   └── products.module.ts
│   │
│   ├── inventory/
│   │   ├── controllers/
│   │   ├── dto/
│   │   ├── entities/
│   │   ├── services/
│   │   └── inventory.module.ts
│   │
│   ├── cart/
│   ├── orders/
│   ├── payments/
│   ├── repairs/
│   ├── loyalty/
│   ├── notifications/
│   └── chat/
│
├── common/
│   ├── decorators/
│   ├── exceptions/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── logging/
│   ├── middleware/
│   ├── pipes/
│   ├── types/
│   └── utils/
│
├── config/
│   ├── app.config.ts
│   ├── database.config.ts
│   └── auth.config.ts
│
├── database/
│   ├── data-source.ts
│   ├── migrations/
│   └── seeds/
│
└── health/
    └── ...
```

## Important

Do not reorganize the entire existing backend in one unrelated ticket.

If the current structure is:

```text
src/auth/
src/users/
```

it is acceptable to continue temporarily.

When introducing new modules, follow one agreed structure consistently.

Do not create a mixture such as:

```text
src/products/
src/modules/inventory/
src/features/orders/
src/domain/cart/
```

The project should converge on one structure.

---

# 5. Module Internal Structure

A normal business module should use:

```text
products/
├── controllers/
│   └── products.controller.ts
├── dto/
│   ├── create-product.dto.ts
│   ├── update-product.dto.ts
│   └── product-query.dto.ts
├── entities/
│   └── product.entity.ts
├── services/
│   └── products.service.ts
├── products.module.ts
└── *.spec.ts
```

Create additional folders only when necessary.

Possible later additions:

```text
repositories/
mappers/
interfaces/
enums/
constants/
```

Avoid overengineering simple modules.

---

# 6. Backend Responsibility Flow

The preferred flow is:

```text
HTTP Request
    ↓
Controller
    ↓
DTO Validation
    ↓
Service / Business Logic
    ↓
TypeORM Repository
    ↓
PostgreSQL
```

Controllers should remain thin.

Controllers should mainly:

- receive HTTP requests
- read params/query/body
- invoke services
- return responses
- apply guards/decorators where appropriate

Business rules belong in services.

Database interaction should not be scattered throughout controllers.

---

# 7. Controller Rules

Controllers should not contain large business workflows.

Good controller responsibility:

```text
Receive request
Validate through DTO
Call service
Return service result
```

Avoid:

```text
Controller
├── manually query multiple repositories
├── calculate business rules
├── change inventory
├── send notification
├── build payment logic
└── catch every possible database error
```

Move those responsibilities into services or dedicated application/domain helpers where needed.

---

# 8. Service Rules

Services own application/business logic.

Examples:

```text
AuthService
→ register
→ login

ProductsService
→ create product
→ update product
→ find products
→ find product by id

InventoryService
→ get stock
→ update stock

RepairService
→ create ticket
→ approve ticket
→ update repair status
```

A service should have a clear business responsibility.

Do not create one giant `AppService` for business logic.

---

# 9. Cross-Module Communication

One module should not directly manipulate another module's internal repository/entity without a clear reason.

Preferred:

```text
OrdersService
   ↓
InventoryService
   ↓
Stock update
```

Avoid:

```text
OrdersService
   ↓
Directly inject Inventory repository
   ↓
Modify inventory internals
```

When one module needs another module's capability, expose a service through the owning module.

This protects module boundaries.

---

# 10. Entity Ownership

Each business entity should have one clear owning module.

Examples:

```text
User → Users Module
Product → Products Module
Category → Categories Module
Inventory → Inventory Module
Cart → Cart Module
Order → Orders Module
RepairTicket → Repairs Module
```

Avoid duplicate entities representing the same database table in different modules.

---

# 11. Database Rules

The project uses:

```text
PostgreSQL
+
TypeORM
```

Important rule:

```text
synchronize: false
```

Database schema changes must be made through migrations.

Do not enable TypeORM automatic synchronization in shared development or production environments.

---

# 12. Migration Rules

Every schema change requires a migration.

Examples:

```text
CreateCategoriesTable
CreateProductsTable
AddProductStock
CreateOrdersTable
AddRepairStatus
```

Migration workflow:

```text
Change Entity
   ↓
Generate / Write Migration
   ↓
Review Migration
   ↓
Run Migration
   ↓
Test
   ↓
Commit Entity + Migration Together
```

Never commit an entity schema change without the corresponding required migration.

---

# 13. Migration Naming

Use meaningful migration names.

Good:

```text
CreateProductsTable
AddCategoryIdToProducts
AddStockQuantityToInventory
CreateRepairTicketsTable
```

Bad:

```text
UpdateDb
Changes
Migration1
Fix
```

The migration name should explain the schema change.

---

# 14. Migration Safety

Before merging a migration:

- verify `up()` works
- verify `down()` when practical
- ensure existing data is not unexpectedly destroyed
- avoid dropping columns/tables casually
- review defaults and nullable behavior
- test on the development database

Production-destructive migrations require extra review.

---

# 15. DTO Rules

All external request data should use DTOs.

Examples:

```text
RegisterDto
LoginDto
CreateProductDto
UpdateProductDto
UpdateStockDto
CreateRepairTicketDto
```

Use `class-validator` rules.

Examples:

```text
@IsEmail()
@IsString()
@IsUUID()
@IsInt()
@Min(0)
@IsOptional()
```

Do not trust frontend validation.

The backend is the final validation authority.

---

# 16. Validation Rules

Validate at the system boundary.

Examples:

```text
Email format
Password minimum length
UUID format
Price constraints
Stock >= 0
Required category
Repair status values
Pagination values
```

Business validation also belongs in services.

Example:

```text
DTO says categoryId is a valid UUID
        ↓
Service verifies category actually exists
```

Both levels are necessary.

---

# 17. Authentication Rules

The existing backend uses JWT.

Current login flow:

```text
POST /auth/login
        ↓
Validate credentials
        ↓
Generate accessToken
        ↓
Return accessToken + user
```

Protected routes expect:

```text
Authorization: Bearer <accessToken>
```

Do not implement a second independent authentication mechanism in another module.

---

# 18. Password Rules

Passwords must:

- never be stored in plain text
- be hashed using the existing bcrypt approach
- never be returned in API responses
- never be written to application logs

Do not log:

```text
password
passwordHash
```

under any circumstance.

---

# 19. Role-Based Authorization

Current roles:

```text
CUSTOMER
ADMIN
REPAIRER
```

Use the existing:

```text
Roles decorator
RolesGuard
JwtAuthGuard
```

or their agreed evolved equivalents.

Example:

```text
Create Product
→ ADMIN only

Update Inventory
→ ADMIN only

View Own Customer Order
→ authenticated CUSTOMER

Update Repair Work
→ appropriate REPAIRER/ADMIN permission
```

Frontend role checks are not security.

Backend RBAC is mandatory.

---

# 20. Public Registration Security

Public registration must not accept arbitrary privileged roles.

Public registration:

```text
Register
   ↓
Role assigned by backend
   ↓
CUSTOMER
```

Never trust:

```json
{
  "role": "ADMIN"
}
```

from a public client.

Admin/repairer account provisioning must use a controlled workflow.

---

# 21. API Route Conventions

Use resource-oriented routes.

Examples:

```text
POST   /auth/register
POST   /auth/login
GET    /auth/profile

GET    /categories
POST   /categories
PATCH  /categories/:id

GET    /products
GET    /products/:id
POST   /products
PATCH  /products/:id

PATCH  /products/:id/stock
```

Keep route naming:

- lowercase
- plural resources where appropriate
- predictable
- consistent

Avoid random action-style routes like:

```text
/doCreateProduct
/getAllProductsNow
/changeProductInfo
```

unless an action is truly not resource-oriented.

---

# 22. HTTP Method Rules

Use:

```text
GET
→ read

POST
→ create / action that creates server-side state

PATCH
→ partial update

PUT
→ full replacement when intentionally used

DELETE
→ delete
```

Do not use POST for every operation.

---

# 23. HTTP Status Code Rules

Use meaningful status codes.

Examples:

```text
200 OK
→ successful read/update

201 Created
→ successful creation

400 Bad Request
→ invalid input

401 Unauthorized
→ missing/invalid authentication

403 Forbidden
→ authenticated but not permitted

404 Not Found
→ resource does not exist

409 Conflict
→ duplicate/conflicting state

500 Internal Server Error
→ unexpected server failure
```

Do not return `200` for failures.

---

# 24. Error Handling

Errors should be:

- predictable
- safe
- understandable
- mapped to appropriate HTTP status codes

Expected business errors should not become generic 500 responses.

Examples:

```text
Duplicate email
→ 409 Conflict

Unknown product
→ 404 Not Found

Invalid stock
→ 400 Bad Request

Customer calls admin endpoint
→ 403 Forbidden
```

---

# 25. Global Exception Handling

As the project grows, prefer consistent exception handling through NestJS mechanisms.

Potential shared structure:

```text
common/
└── filters/
    └── http-exception.filter.ts
```

The team may introduce a global exception filter when needed.

Do not expose:

- stack traces
- SQL statements containing sensitive information
- internal secrets
- environment variables

to clients.

---

# 26. Standard Error Response

Keep error responses consistent.

Recommended conceptual shape:

```json
{
  "statusCode": 404,
  "message": "Product not found",
  "error": "Not Found",
  "path": "/products/...",
  "timestamp": "..."
}
```

Do not invent a different error structure per module.

If the current NestJS default is being used, maintain consistency until a shared response format is deliberately introduced.

---

# 27. Logging Strategy

Logging is required for important backend operations.

The backend must log:

- application startup/shutdown
- database connectivity failures
- unexpected errors
- critical business operation failures
- security-relevant authorization/authentication failures where useful
- external integration failures
- important state-changing operations
- background/async processing failures

Do **not** log every normal function call.

Logging should help answer:

```text
What happened?
Where did it happen?
When did it happen?
Which operation/resource was affected?
Why did it fail?
```

---

# 28. Logging Levels

Use consistent levels.

## `log` / `info`

Normal important events.

Examples:

```text
Application started
Product created
Repair ticket approved
Inventory updated
Order created
```

## `warn`

Unexpected or suspicious behavior that does not crash the operation/system.

Examples:

```text
Repeated invalid login
Low stock threshold reached
Retryable external integration failure
Deprecated input received
```

## `error`

Operation failed or unexpected exception occurred.

Examples:

```text
Database query failure
Product creation failed unexpectedly
PayHere callback processing failed
Gemini API failure
Notification delivery failed
```

## `debug`

Development-only diagnostic details.

Do not depend on debug logs for essential production observability.

## `fatal`

Use only when the application/system cannot continue safely, if the logging implementation supports it.

---

# 29. Critical Function Logging

State-changing or business-critical functions should have appropriate success/failure logging.

Examples:

```text
Register user
Create product
Update product
Update inventory
Create order
Confirm payment
Create repair ticket
Approve/reject repair
Change repair status
Redeem loyalty points
Send important notification
```

This does **not** mean logging sensitive request bodies.

Recommended conceptual log:

```text
Product created
productId=<id>
actorUserId=<admin-id>
categoryId=<category-id>
```

Failure:

```text
Product creation failed
actorUserId=<admin-id>
categoryId=<category-id>
reason=<safe reason>
```

---

# 30. What Must Never Be Logged

Never log:

```text
Plain-text passwords
Password hashes
JWT access tokens
JWT secrets
Database passwords
API secrets
Payment credentials
Full card/payment-sensitive data
Reset tokens
Private environment variables
```

Be careful with:

```text
Email
Phone number
Address
Repair device information
```

Only log personal information when genuinely necessary and use the minimum required detail.

---

# 31. Logging Context

Every module/service should use meaningful logger context.

Example concept:

```text
ProductsService
InventoryService
AuthService
OrdersService
RepairService
```

Logs should make it clear which module generated the entry.

Use NestJS `Logger` consistently unless the team deliberately adopts a structured logger later.

---

# 32. Structured Logging Direction

For the current project, NestJS Logger is acceptable.

If production observability requirements increase, the team may later introduce structured JSON logging such as Pino.

Do not introduce another logging library in an unrelated ticket.

The important requirement now is:

```text
Consistent logging
+
Safe log content
+
Useful context
```

---

# 33. Logging Success vs Noise

Do log meaningful state changes.

Good:

```text
Inventory updated: productId=..., oldQty=5, newQty=10
```

Avoid noisy logs such as:

```text
Entered function
Line 1 complete
Line 2 complete
Loop running
```

Logging should support debugging and operational understanding, not create noise.

---

# 34. Authentication Logging

Useful events may include:

```text
Registration succeeded
Registration failed due to duplicate email
Login succeeded
Login failed
Unauthorized protected-route access
Forbidden admin operation
```

But never log:

```text
password
token
passwordHash
```

Avoid exposing unnecessary personal data.

---

# 35. Database Failure Logging

Unexpected database errors should be logged with enough context to identify the operation.

Example:

```text
Failed to update product stock
productId=<id>
operation=inventory.update
```

Do not expose full connection strings or credentials.

---

# 36. External Integration Logging

Future external integrations include:

```text
PayHere
Gemini API
Mailgun
Twilio
Socket.IO workflows
S3
```

For integrations log:

```text
integration
operation
resource reference
safe status/error
```

Never log external secrets.

Example:

```text
PayHere payment verification failed
orderId=<id>
```

---

# 37. Correlation / Request IDs

As the backend grows, introduce a request/correlation ID so related logs can be traced through one request.

Conceptually:

```text
Incoming Request
      ↓
requestId=abc123
      ↓
Controller
      ↓
Service
      ↓
Database / Integration
```

All related critical logs can include:

```text
requestId=abc123
```

This is recommended when integration complexity increases.

Do not block simple Stage 1 tickets solely to implement a full observability system.

---

# 38. Audit Logging vs Application Logging

Understand the difference.

Application logs:

```text
Service failed
API returned 500
Database unavailable
```

Audit/business history:

```text
Admin changed stock from 10 to 4
Repairer changed repair status
Admin approved repair
```

Important business history that users/admins need later should eventually be stored as domain/audit data, not only application log files.

Do not use normal logs as the only permanent audit trail for business-critical history.

---

# 39. Transactions

Use database transactions when multiple database changes must succeed or fail together.

Example future order flow:

```text
Create Order
+
Create Order Items
+
Update Stock
+
Create Payment Record
```

If partial completion would corrupt business state, use a transaction.

Do not wrap every simple single-row operation in unnecessary transactions.

---

# 40. Concurrency and Inventory

Inventory is sensitive to concurrent changes.

For Stage 1 manual stock management, keep implementation simple.

When Orders/Checkout are implemented, revisit:

```text
concurrent purchases
stock validation
transaction boundaries
row locking / safe atomic updates
```

Do not assume frontend stock values are authoritative.

The backend/database is the source of truth.

---

# 41. Configuration Rules

Environment-specific values belong in environment variables/configuration.

Examples:

```text
PORT
DB_HOST
DB_PORT
DB_USERNAME
DB_PASSWORD
DB_NAME
JWT_SECRET
JWT_EXPIRES_IN
PAYHERE_...
GEMINI_...
MAILGUN_...
TWILIO_...
AWS_...
```

Do not hard-code secrets.

Maintain `.env.example` with required variable names and safe placeholder values.

Never commit the real `.env`.

---

# 42. Configuration Validation

As the project grows, validate required configuration at application startup.

The application should fail early and clearly when essential configuration is missing.

Example:

```text
JWT_SECRET missing
→ startup should fail clearly
```

rather than failing later during a customer request.

---

# 43. CORS

Frontend and backend may run on different origins during development.

Example:

```text
Frontend: http://localhost:5173
Backend:  http://localhost:3000
```

Configure CORS deliberately.

Do not use an unrestricted production CORS policy without review.

Development and production allowed origins should be configuration-driven.

---

# 44. Security Headers and Production Hardening

Before production deployment, ensure appropriate HTTP security configuration.

Potential areas:

```text
Helmet/security headers
HTTPS
CORS
rate limiting
request size limits
secure environment configuration
```

These should be introduced deliberately and tested.

---

# 45. API Documentation

Every module should have a clear API contract.

For each endpoint document:

```text
Method
Path
Authentication
Allowed roles
Request body
Query parameters
Success response
Expected errors
```

Swagger/OpenAPI can be introduced if agreed by the team.

Until then, keep endpoint documentation in tickets/docs.

Frontend and backend developers should agree on the API contract before parallel implementation.

---

# 46. Pagination

For potentially large collections, introduce pagination when needed.

Conceptual query:

```text
?page=1&limit=20
```

Return predictable metadata.

Do not implement several different pagination styles in different modules.

Stage 1 endpoints may remain simple if data size is intentionally small, but future list APIs should use one agreed pattern.

---

# 47. Filtering and Sorting

Filtering belongs in query DTOs when APIs require it.

Examples:

```text
categoryId
status
search
sortBy
sortOrder
```

Validate query values.

Do not parse complex query behavior manually across controllers.

---

# 48. Naming Conventions

## Modules

```text
ProductsModule
OrdersModule
RepairsModule
```

## Controllers

```text
ProductsController
OrdersController
```

## Services

```text
ProductsService
InventoryService
```

## Entities

```text
Product
Category
RepairTicket
```

## DTOs

```text
CreateProductDto
UpdateProductDto
ProductQueryDto
```

## Enums

```text
UserRole
RepairStatus
OrderStatus
```

Use one terminology consistently.

---

# 49. File Naming

Use kebab-case for filenames consistent with NestJS conventions.

Examples:

```text
products.controller.ts
products.service.ts
product.entity.ts
create-product.dto.ts
repair-status.enum.ts
```

Avoid mixed styles.

---

# 50. Business Enum Rules

Business states should use enums where appropriate.

Examples:

```text
UserRole
OrderStatus
RepairStatus
PaymentStatus
```

Do not scatter string literals such as:

```text
"pending"
"PENDING"
"Pending"
```

through different modules.

Use one canonical backend value.

---

# 51. Repository / TypeORM Rules

Use TypeORM repositories through dependency injection.

Avoid creating database connections manually inside services.

Keep persistence logic readable.

For complex queries, encapsulate them appropriately rather than writing huge query builders inline throughout business methods.

---

# 52. Avoid N+1 and Over-Fetching

When adding relations, be deliberate about what is loaded.

Do not automatically eager-load large object graphs.

API responses should contain what the client needs, not every related entity.

As data grows, review query count and payload size.

---

# 53. API Response Security

Never accidentally return internal/sensitive fields.

Examples that must not be returned:

```text
passwordHash
secret tokens
integration credentials
internal security metadata
```

Use explicit response shaping when entity serialization could expose unwanted fields.

---

# 54. Testing Strategy

Every important backend module should have tests appropriate to its risk.

Use:

```text
Unit tests
Integration/e2e tests
Manual API verification during development
```

Prioritize tests for:

```text
Authentication
RBAC
Product business rules
Inventory validation
Orders
Payments
Repair status transitions
```

---

# 55. Unit Tests

Unit tests should target business logic.

Examples:

```text
duplicate registration rejected
invalid password rejected
negative stock rejected
unknown product rejected
unauthorized role blocked
```

Mock dependencies where appropriate.

---

# 56. E2E Tests

E2E tests should verify important flows through HTTP boundaries.

Examples:

```text
Register → Login → Profile

Admin login → Create Product → Read Product

Customer token → Admin route → 403
```

Do not require complete E2E coverage for every trivial endpoint before development can progress, but protect important flows.

---

# 57. Manual Testing

Before a backend PR is considered complete, manually verify:

```text
happy path
validation failure
resource not found
unauthenticated request
unauthorized role
database persistence
```

where applicable.

Use the real development database for final verification.

---

# 58. Health Checks

Maintain health endpoints for important infrastructure.

Existing example:

```text
GET /health/database
```

As external dependencies are added, consider whether production health/readiness checks should cover them.

Do not put expensive business logic in health checks.

---

# 59. Performance Rules

Do not optimize prematurely, but avoid obvious inefficiencies.

Examples:

- avoid unnecessary repeated DB queries
- use indexes where data/query patterns require them
- paginate large lists
- avoid returning huge relations
- avoid blocking operations in request paths where unnecessary

Measure before major optimization.

---

# 60. Product Module Example

Recommended flow:

```text
POST /products
      ↓
JwtAuthGuard
      ↓
RolesGuard (ADMIN)
      ↓
CreateProductDto Validation
      ↓
ProductsController
      ↓
ProductsService
      ↓
Validate Category
      ↓
Product Repository
      ↓
PostgreSQL
      ↓
Log Product Created
```

Failure:

```text
Database / unexpected failure
      ↓
Log Safe Error Context
      ↓
Return Appropriate Exception
```

---

# 61. Inventory Module Example

Recommended flow:

```text
PATCH /products/:id/stock
      ↓
JWT + ADMIN
      ↓
UpdateStockDto
      ↓
InventoryService
      ↓
Verify Product
      ↓
Validate Stock >= 0
      ↓
Persist
      ↓
Log oldQty/newQty
```

Do not log the entire product entity unnecessarily.

---

# 62. Repair Module Direction

Repair logic belongs in its own module.

Potential responsibilities:

```text
Create repair ticket
Get repair ticket
Approve/reject repair
Assign repairer
Update repair status
Track repair
```

Repair status transitions should eventually be defined clearly rather than allowing arbitrary strings.

Critical status changes should be logged with safe identifiers.

---

# 63. Order Module Direction

Order logic belongs in the Orders module.

Do not place order creation logic in Cart or Products.

Conceptual flow:

```text
Cart
 ↓
Checkout
 ↓
Order Service
 ↓
Validate Products/Stock
 ↓
Create Order
 ↓
Payment Process
```

Module boundaries must remain clear.

---

# 64. Payment Module Direction

Payment integration should be isolated in a Payments module/service.

Do not scatter PayHere-specific code across:

```text
OrdersController
CartService
ProductsService
```

Keep provider-specific behavior behind a payment service/integration boundary.

Payment callback/verification failures must be logged safely.

---

# 65. Notification Module Direction

Email/SMS notifications should be centralized.

Conceptually:

```text
Business Module
      ↓
NotificationService
      ↓
Mailgun / Twilio
```

Do not call external messaging providers directly from many unrelated controllers.

Failures should be logged with business resource identifiers, not secrets.

---

# 66. AI Integration Direction

Gemini integration belongs behind a dedicated service/module.

Do not place direct Gemini API calls throughout controllers.

The AI scope remains:

```text
Product recommendations
Public repair FAQs
```

Complex repair diagnosis should remain with human technicians as defined by the project design.

---

# 67. Coding Agent Instructions

Any AI coding agent working on the backend must follow this document.

Before changing code, the agent must:

1. inspect the existing module and project structure
2. understand the current ticket and API contract
3. inspect existing services/entities/DTOs/guards
4. reuse existing authentication and RBAC
5. preserve modular-monolith boundaries
6. use TypeScript
7. use TypeORM migrations for schema changes
8. add validation at external boundaries
9. add safe logs for critical operations and failures
10. avoid unrelated refactors
11. keep backward compatibility unless the ticket explicitly changes a contract
12. update/add tests appropriate to the change

---

# 68. Agent Module Boundary Rule

Before adding functionality, identify the owning module.

Examples:

```text
Product price change
→ Products

Stock update
→ Inventory

Order creation
→ Orders

Repair state
→ Repairs

Payment verification
→ Payments
```

Do not place code in whichever service is easiest to access.

---

# 69. Agent Reuse Rule

Before creating a new:

```text
guard
decorator
service
entity
enum
utility
exception
```

search the codebase for an existing equivalent.

Avoid duplicated concepts such as:

```text
AdminGuard
RoleGuard
RolesGuard
CheckRoleGuard
```

all solving the same problem.

---

# 70. Agent Migration Rule

If an entity/database schema changes:

```text
Entity Change
+
Migration
+
Test
```

must be considered together.

An agent must not silently enable `synchronize: true` to avoid writing migrations.

---

# 71. Agent Logging Rule

When implementing a critical state-changing operation, ask:

```text
Would we need evidence/context if this fails in development or production?
```

If yes, add an appropriate log.

Logs must:

- use safe context
- identify the operation/module
- include relevant resource IDs
- avoid secrets
- avoid raw tokens/passwords
- avoid unnecessary personal data

---

# 72. Agent Error Rule

Do not hide errors with:

```text
catch (error) {
  return null;
}
```

unless null is genuinely the defined business result.

Expected failures should map to explicit exceptions.

Unexpected failures should be logged and allowed to follow the project's consistent error handling.

---

# 73. Agent Type Safety Rule

Do not use `any` to bypass TypeScript errors without a strong reason.

Use:

```text
DTOs
interfaces
types
entities
enums
```

that represent the actual data.

---

# 74. Agent Security Rule

Never:

- hard-code secrets
- log credentials/tokens
- expose passwordHash
- remove guards to make tests pass
- allow public role escalation
- trust client-provided authorization
- disable validation globally to bypass errors

---

# 75. Agent Scope Rule

Only modify files required for the current ticket.

Example: implementing Categories must not also:

```text
rewrite authentication
rename User roles
change JWT format
replace TypeORM
restructure all modules
```

unless explicitly required.

---

# 76. Pull Request Rules

Keep PRs focused.

A backend PR should clearly mention:

```text
What changed
Endpoints added/changed
Database migration added
Authentication/RBAC requirement
Important business rules
Logging added
Tests performed
```

Suggested titles:

```text
feat(categories): add category management API
feat(products): add public product endpoints
feat(inventory): add stock management
feat(repairs): add repair ticket creation
fix(auth): reject inactive users during login
```

---

# 77. Backend PR Checklist

Before submitting:

- [ ] Module ownership is correct
- [ ] Controller is thin
- [ ] Business logic is in service
- [ ] DTO validation exists
- [ ] Authentication is correct
- [ ] RBAC is correct
- [ ] Database migration exists if schema changed
- [ ] `synchronize` remains disabled
- [ ] Expected 400/401/403/404/409 cases are handled where applicable
- [ ] Critical failures are logged
- [ ] Critical state changes have appropriate logs
- [ ] Logs contain no secrets/passwords/tokens
- [ ] No unnecessary `any`
- [ ] No duplicate shared logic
- [ ] Existing API contracts are not accidentally broken
- [ ] Tests are added/updated where appropriate
- [ ] Happy path manually verified
- [ ] Failure path manually verified
- [ ] Database persistence verified
- [ ] No unrelated refactors are included
- [ ] No temporary debug code remains

---

# 78. Definition of a Well-Designed Module

A good module should be understandable as:

```text
Module
  ↓
Controller
  ↓
DTO
  ↓
Service
  ↓
Repository/TypeORM
  ↓
Database
```

with:

```text
Clear ownership
Validation
Security
Logging
Error handling
Tests
```

Another team member should be able to open the module and understand where each responsibility belongs.

---

# 79. Final Backend Principle

The backend should always aim for:

```text
Modular
Predictable
Secure
Validated
Observable
Testable
Consistent
```

The preferred request flow is:

```text
Request
  ↓
Authentication / Authorization
  ↓
DTO Validation
  ↓
Controller
  ↓
Service / Business Rule
  ↓
Owning Module / Cross-Module Service
  ↓
TypeORM
  ↓
PostgreSQL
  ↓
Safe Logging of Important Outcome
  ↓
Consistent API Response
```

> **Do not solve the same backend problem differently in every module. Follow the modular-monolith boundaries, shared security model, validation rules, logging rules, migration workflow, and established NestJS patterns.**
