import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsernamesAndSessions1792210000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "username" character varying`,
    );
    // Preserve existing accounts with a deterministic, unique username.
    await queryRunner.query(
      `UPDATE "users" SET "username" = 'user_' || replace("id"::text, '-', '')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_username" UNIQUE ("username")`,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_sessions" ("tokenHash" character varying PRIMARY KEY, "userId" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE, "expiresAt" timestamptz NOT NULL)`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
  }
}
