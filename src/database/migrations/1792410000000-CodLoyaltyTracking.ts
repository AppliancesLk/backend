import { MigrationInterface, QueryRunner } from 'typeorm';

export class CodLoyaltyTracking1792410000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE orders ADD COLUMN "paymentMethod" varchar(24) NOT NULL DEFAULT 'PAYHERE' CHECK ("paymentMethod" IN ('PAYHERE','CASH_ON_DELIVERY','LOYALTY')), ADD COLUMN "loyaltyRedeemed" numeric(30,2) NOT NULL DEFAULT 0 CHECK ("loyaltyRedeemed" >= 0), ADD COLUMN "loyaltyEarned" numeric(30,2) NOT NULL DEFAULT 0 CHECK ("loyaltyEarned" >= 0), ADD COLUMN "stockReserved" boolean NOT NULL DEFAULT false`,
    );
    await runner.query(
      `UPDATE orders SET "stockReserved" = true WHERE status IN ('CONFIRMED','PROCESSING','SHIPPED','DELIVERED')`,
    );
    await runner.query(
      `ALTER TABLE payments ADD COLUMN method varchar(24) NOT NULL DEFAULT 'PAYHERE' CHECK (method IN ('PAYHERE','CASH_ON_DELIVERY','LOYALTY')), DROP CONSTRAINT "CHK_payments_positive_amount", ADD CONSTRAINT "CHK_payments_positive_amount" CHECK (amount >= 0), ADD CONSTRAINT "CHK_payments_zero_loyalty" CHECK (amount > 0 OR method = 'LOYALTY')`,
    );
    await runner.query(
      `CREATE TABLE order_events (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "orderId" uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE, status order_status_enum NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now())`,
    );
    await runner.query(
      `CREATE INDEX "IDX_order_events_order_created" ON order_events ("orderId", "createdAt")`,
    );
    await runner.query(
      `INSERT INTO order_events ("orderId", status, "createdAt") SELECT id, status, "updatedAt" FROM orders`,
    );
    await runner.query(
      `CREATE TABLE loyalty_entries (id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, "orderId" uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE, kind varchar(10) NOT NULL CHECK (kind IN ('EARN','REDEEM','REFUND')), amount numeric(30,2) NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "UQ_loyalty_order_kind" UNIQUE ("orderId", kind), CONSTRAINT "CHK_loyalty_direction" CHECK ((kind = 'REDEEM' AND amount < 0) OR (kind IN ('EARN','REFUND') AND amount > 0)))`,
    );
    await runner.query(
      `CREATE INDEX "IDX_loyalty_user_created" ON loyalty_entries ("userId", "createdAt")`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE loyalty_entries');
    await runner.query('DROP TABLE order_events');
    await runner.query(
      `ALTER TABLE payments DROP CONSTRAINT "CHK_payments_zero_loyalty", DROP CONSTRAINT "CHK_payments_positive_amount", ADD CONSTRAINT "CHK_payments_positive_amount" CHECK (amount > 0) NOT VALID, DROP COLUMN method`,
    );
    await runner.query(
      `ALTER TABLE orders DROP COLUMN "paymentMethod", DROP COLUMN "loyaltyRedeemed", DROP COLUMN "loyaltyEarned", DROP COLUMN "stockReserved"`,
    );
  }
}
