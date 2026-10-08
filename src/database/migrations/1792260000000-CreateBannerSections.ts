import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBannerSections1792260000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "banner_sections" (
      "position" varchar(20) PRIMARY KEY,
      "visible" boolean NOT NULL DEFAULT false,
      "slides" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_banner_position" CHECK ("position" IN ('top', 'middle', 'bottom-one', 'bottom-two')),
      CONSTRAINT "CHK_banner_slides" CHECK (jsonb_typeof("slides") = 'array' AND jsonb_array_length("slides") <= CASE WHEN "position" = 'top' THEN 4 ELSE 1 END),
      CONSTRAINT "CHK_banner_visible" CHECK (NOT "visible" OR jsonb_array_length("slides") > 0)
    )`);
    await queryRunner.query(
      `INSERT INTO "banner_sections" ("position") VALUES ('top'), ('middle'), ('bottom-one'), ('bottom-two')`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "banner_sections"');
  }
}
