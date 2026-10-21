import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeasonalThemeAnimations1792500100000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE storefront_theme ADD COLUMN animations boolean NOT NULL DEFAULT true',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE storefront_theme DROP COLUMN animations');
  }
}
