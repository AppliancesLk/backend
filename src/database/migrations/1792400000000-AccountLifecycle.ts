import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountLifecycle1792400000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE users ADD COLUMN "emailVerifiedAt" timestamptz, ADD COLUMN "deactivatedAt" timestamptz, ADD COLUMN "loyaltyBalance" numeric(30,2) NOT NULL DEFAULT 0, ADD CONSTRAINT "CHK_users_loyalty_balance" CHECK ("loyaltyBalance" >= 0)`,
    );
    // Grandfather existing accounts. New registrations explicitly start unverified.
    await runner.query(
      `UPDATE users SET "emailVerifiedAt" = "createdAt", "deactivatedAt" = CASE WHEN "isActive" THEN NULL ELSE now() END`,
    );
    await runner.query(`CREATE TABLE account_actions (
      "tokenHash" varchar(64) PRIMARY KEY, "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose varchar(20) NOT NULL CHECK (purpose IN ('VERIFY_EMAIL','RESET_PASSWORD')),
      "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_account_actions_user_purpose" UNIQUE ("userId", purpose))`);
    await runner.query(
      `ALTER TABLE notifications DROP CONSTRAINT "CHK_notifications_type"`,
    );
    await runner.query(
      `ALTER TABLE notifications ADD CONSTRAINT "CHK_notifications_type" CHECK (type IN ('WELCOME','LOGIN','ORDER_CREATED','PAYMENT_SUCCESS','PAYMENT_FAILED','ORDER_STATUS_UPDATED','REPAIR_CREATED','REPAIR_APPROVED','REPAIR_REJECTED','REPAIR_STATUS_UPDATED','REPAIR_READY_FOR_COLLECTION','PROMOTION','EMAIL_VERIFICATION','PASSWORD_RESET'))`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE account_actions');
    await runner.query(
      `DELETE FROM notifications WHERE type IN ('EMAIL_VERIFICATION','PASSWORD_RESET')`,
    );
    await runner.query(
      `ALTER TABLE notifications DROP CONSTRAINT "CHK_notifications_type"`,
    );
    await runner.query(
      `ALTER TABLE notifications ADD CONSTRAINT "CHK_notifications_type" CHECK (type IN ('WELCOME','LOGIN','ORDER_CREATED','PAYMENT_SUCCESS','PAYMENT_FAILED','ORDER_STATUS_UPDATED','REPAIR_CREATED','REPAIR_APPROVED','REPAIR_REJECTED','REPAIR_STATUS_UPDATED','REPAIR_READY_FOR_COLLECTION','PROMOTION'))`,
    );
    await runner.query(
      `ALTER TABLE users DROP CONSTRAINT "CHK_users_loyalty_balance", DROP COLUMN "loyaltyBalance", DROP COLUMN "deactivatedAt", DROP COLUMN "emailVerifiedAt"`,
    );
  }
}
