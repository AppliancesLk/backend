import { MigrationInterface, QueryRunner } from 'typeorm';
export class PromotionQueueIsolation1792600100000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE promotion_runs ADD COLUMN "queueKey" varchar(80) NOT NULL DEFAULT 'live'`,
    );
    await runner.query(
      `CREATE INDEX "IDX_promotion_runs_queue" ON promotion_runs ("queueKey", status)`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP INDEX "IDX_promotion_runs_queue"');
    await runner.query('ALTER TABLE promotion_runs DROP COLUMN "queueKey"');
  }
}
