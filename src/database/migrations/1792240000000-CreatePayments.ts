import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayments1792240000000 implements MigrationInterface {
  name = 'CreatePayments1792240000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TYPE "payment_status_enum" AS ENUM (' +
        "'PENDING', 'SUCCESS', 'FAILED', 'CANCELLED')",
    );
    await queryRunner.query(
      'CREATE TABLE "payments" (' +
        '"id" uuid NOT NULL DEFAULT uuid_generate_v4(),' +
        '"orderId" uuid NOT NULL,' +
        '"customerId" uuid NOT NULL,' +
        '"payherePaymentId" varchar,' +
        '"amount" numeric(30,2) NOT NULL,' +
        '"currency" varchar(3) NOT NULL DEFAULT \'LKR\',' +
        '"status" "payment_status_enum" NOT NULL DEFAULT \'PENDING\',' +
        '"providerStatusCode" varchar(3),' +
        '"verifiedAt" timestamptz,' +
        '"createdAt" timestamptz NOT NULL DEFAULT now(),' +
        '"updatedAt" timestamptz NOT NULL DEFAULT now(),' +
        'CONSTRAINT "PK_payments" PRIMARY KEY ("id"),' +
        'CONSTRAINT "UQ_payments_order" UNIQUE ("orderId"),' +
        'CONSTRAINT "CHK_payments_positive_amount" CHECK ("amount" > 0),' +
        'CONSTRAINT "CHK_payments_currency" CHECK ("currency" = \'LKR\'),' +
        'CONSTRAINT "FK_payments_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT,' +
        'CONSTRAINT "FK_payments_customer" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT' +
        ')',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_payments_payhere_id" ON "payments" ("payherePaymentId") WHERE "payherePaymentId" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_payments_customer_created" ON "payments" ("customerId", "createdAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "payments"');
    await queryRunner.query('DROP TYPE "payment_status_enum"');
  }
}
