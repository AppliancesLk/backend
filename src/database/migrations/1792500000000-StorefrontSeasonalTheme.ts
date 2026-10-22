import { MigrationInterface, QueryRunner } from 'typeorm';
export class StorefrontSeasonalTheme1792500000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE storefront_theme (
      id integer PRIMARY KEY DEFAULT 1 CONSTRAINT "CHK_storefront_theme_singleton" CHECK (id=1),
      theme varchar(20) NOT NULL DEFAULT 'DEFAULT' CHECK (theme IN ('DEFAULT','AVURUDU','CHRISTMAS','HALLOWEEN','EASTER')),
      headline varchar(80) NOT NULL DEFAULT '', message varchar(180) NOT NULL DEFAULT '',
      "showGreeting" boolean NOT NULL DEFAULT true, decorations boolean NOT NULL DEFAULT true,
      "startsAt" timestamptz, "endsAt" timestamptz,
      version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
      "updatedBy" uuid REFERENCES users(id) ON DELETE SET NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_storefront_theme_window" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt")
    )`);
    await runner.query(`INSERT INTO storefront_theme (id) VALUES (1)`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE storefront_theme');
  }
}
