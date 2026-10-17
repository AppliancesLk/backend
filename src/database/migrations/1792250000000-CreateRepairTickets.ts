import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRepairTickets1792250000000 implements MigrationInterface {
  name = 'CreateRepairTickets1792250000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TYPE "repair_status_enum" AS ENUM (' +
        "'PENDING', 'APPROVED', 'REJECTED', 'ASSIGNED', 'IN_PROGRESS', " +
        "'AWAITING_PARTS', 'READY_FOR_COLLECTION', 'COMPLETED', 'CANCELLED')",
    );
    await queryRunner.query(`CREATE TABLE "repair_tickets" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "reference" varchar(32) NOT NULL,
      "customerId" uuid NOT NULL,
      "assignedRepairerId" uuid,
      "device" jsonb NOT NULL,
      "problemDescription" text NOT NULL,
      "status" "repair_status_enum" NOT NULL DEFAULT 'PENDING',
      "reviewedAt" timestamptz,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_repair_tickets" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_repair_tickets_reference" UNIQUE ("reference"),
      CONSTRAINT "CHK_repair_tickets_reference" CHECK ("reference" ~ '^RPR-[0-9]{8}-[A-F0-9]{8}$'),
      CONSTRAINT "CHK_repair_tickets_device_object" CHECK (jsonb_typeof("device") = 'object'),
      CONSTRAINT "CHK_repair_tickets_problem_length" CHECK (char_length("problemDescription") BETWEEN 10 AND 2000),
      CONSTRAINT "FK_repair_tickets_customer" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_repair_tickets_repairer" FOREIGN KEY ("assignedRepairerId") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_repair_tickets_customer_created" ON "repair_tickets" ("customerId", "createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_repair_tickets_status_created" ON "repair_tickets" ("status", "createdAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "repair_tickets"');
    await queryRunner.query('DROP TYPE "repair_status_enum"');
  }
}
