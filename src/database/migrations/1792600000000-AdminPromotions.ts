import { MigrationInterface, QueryRunner } from 'typeorm';
export class AdminPromotions1792600000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE promotions (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), content jsonb NOT NULL,
      version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
      "createdBy" uuid REFERENCES users(id) ON DELETE SET NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(`CREATE TABLE promotion_runs (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "campaignId" uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
      "campaignVersion" integer NOT NULL, snapshot jsonb NOT NULL, "recipientCount" integer NOT NULL CHECK ("recipientCount">0),
      status varchar(12) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','SENDING','SENT','PARTIAL','FAILED','SKIPPED')),
      "createdBy" uuid REFERENCES users(id) ON DELETE SET NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "finishedAt" timestamptz
    )`);
    await runner.query(
      `CREATE INDEX "IDX_promotion_runs_campaign" ON promotion_runs ("campaignId", "createdAt" DESC)`,
    );
    await runner.query(`CREATE TABLE promotion_recipients (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "runId" uuid NOT NULL REFERENCES promotion_runs(id) ON DELETE CASCADE,
      "userId" uuid REFERENCES users(id) ON DELETE SET NULL, username varchar(255) NOT NULL, email varchar(320) NOT NULL,
      status varchar(12) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','SENT','FAILED','SKIPPED','UNKNOWN')),
      "notificationId" uuid, "claimedAt" timestamptz, "finishedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now(),
      UNIQUE ("runId", "userId"), UNIQUE ("runId", email)
    )`);
    await runner.query(
      `CREATE INDEX "IDX_promotion_recipients_queue" ON promotion_recipients (status, "createdAt")`,
    );
    await runner.query(
      `CREATE INDEX "IDX_promotion_recipients_run" ON promotion_recipients ("runId")`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE promotion_recipients');
    await runner.query('DROP TABLE promotion_runs');
    await runner.query('DROP TABLE promotions');
  }
}
