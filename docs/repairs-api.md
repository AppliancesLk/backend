# Repair ticket creation API

## Create a repair ticket

`POST /repairs` requires the existing authenticated session and the `CUSTOMER`
role. The customer identity is read from the JWT-backed session and cannot be
provided in the request.

```json
{
  "device": {
    "deviceType": "Washing Machine",
    "brand": "LG",
    "model": "F4V5VYP2T",
    "serialNumber": "SN-12345",
    "purchaseDate": "2025-05-20"
  },
  "problemDescription": "The drum stops during the spin cycle and displays an error code."
}
```

`serialNumber` and `purchaseDate` are optional. Device type, brand, model, and a
10–2000 character problem description are required. Future purchase dates are
rejected. Unknown fields, including `customerId`, `userId`, `status`,
`assignedRepairerId`, and `reference`, are rejected by the global validation
policy.

A successful request returns HTTP 201 with the persisted ticket. Its status is
`PENDING`, assignment/review fields are null, and the server-generated reference
uses `RPR-YYYYMMDD-XXXXXXXX`. References and UUID IDs are unique.

The shared status enum prepares later workflows with `PENDING`, `APPROVED`,
`REJECTED`, `ASSIGNED`, `IN_PROGRESS`, `AWAITING_PARTS`,
`READY_FOR_COLLECTION`, `COMPLETED`, and `CANCELLED`. This ticket implements no
review, assignment, tracking, or status-update endpoint.

`CreateRepairTickets1792250000000` creates the enum, repair table, ownership and
future repairer foreign keys, uniqueness/check constraints, and customer/status
indexes. TypeORM synchronization remains disabled.

```sh
npm run migration:run -- -d src/database/data-source.ts
npm run build
npm run lint
npm run test:repairs:integration
```
