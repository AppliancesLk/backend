import { MigrationInterface, QueryRunner } from 'typeorm';
export class CreateOrdersAndOrderItems1792230000000 implements MigrationInterface {
  name = 'CreateOrdersAndOrderItems1792230000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "order_status_enum" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(`CREATE TABLE "orders" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "customerId" uuid NOT NULL,
      "idempotencyKey" uuid NOT NULL, "requestHash" varchar(64) NOT NULL,
      "sourceCartId" uuid NOT NULL,
      "status" "order_status_enum" NOT NULL DEFAULT 'PENDING_PAYMENT',
      "currency" varchar(3) NOT NULL DEFAULT 'LKR',
      "subtotal" numeric(30,2) NOT NULL, "total" numeric(30,2) NOT NULL,
      "delivery" jsonb NOT NULL, "preparedAt" timestamptz NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_orders_customer_key" UNIQUE ("customerId", "idempotencyKey"),
      CONSTRAINT "CHK_orders_nonnegative_totals" CHECK ("subtotal" >= 0 AND "total" >= 0),
      CONSTRAINT "CHK_orders_currency" CHECK ("currency" = 'LKR'),
      CONSTRAINT "FK_orders_customer" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_orders_customer_created" ON "orders" ("customerId", "createdAt")',
    );
    await queryRunner.query(`CREATE TABLE "order_items" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL, "productId" uuid NOT NULL,
      "name" varchar NOT NULL, "SKU" varchar NOT NULL, "images" text[] NOT NULL DEFAULT '{}',
      "quantity" integer NOT NULL, "unitPrice" numeric(12,2) NOT NULL, "lineTotal" numeric(30,2) NOT NULL,
      CONSTRAINT "PK_order_items" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_order_items_order_product" UNIQUE ("orderId", "productId"),
      CONSTRAINT "CHK_order_items_positive_quantity" CHECK ("quantity" > 0),
      CONSTRAINT "CHK_order_items_amounts" CHECK ("unitPrice" >= 0 AND "lineTotal" = "unitPrice" * "quantity"),
      CONSTRAINT "FK_order_items_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_order_items_product" FOREIGN KEY ("productId") REFERENCES "products"("productID") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_order_items_product" ON "order_items" ("productId")',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "order_items"');
    await queryRunner.query('DROP TABLE "orders"');
    await queryRunner.query('DROP TYPE "order_status_enum"');
  }
}
