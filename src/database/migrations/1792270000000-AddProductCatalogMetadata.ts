import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddProductCatalogMetadata1792270000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE products
      ADD COLUMN "brand" varchar(80),
      ADD COLUMN "subtitle" varchar(160) NOT NULL DEFAULT '',
      ADD COLUMN "badge" varchar(10),
      ADD COLUMN "compareAtPrice" numeric(12,2),
      ADD COLUMN "createdAt" timestamptz,
      ADD CONSTRAINT "CHK_product_badge" CHECK (badge IS NULL OR badge IN ('NEW','HOT','DEAL')),
      ADD CONSTRAINT "CHK_product_brand" CHECK (brand IS NULL OR (brand = btrim(brand) AND char_length(brand) > 0 AND position(',' in brand) = 0)),
      ADD CONSTRAINT "CHK_product_compare_price" CHECK ("compareAtPrice" IS NULL OR "compareAtPrice" > price)`);
    // Preserve unknown creation dates for legacy products; timestamp new inserts only.
    await runner.query(
      'ALTER TABLE products ALTER COLUMN "createdAt" SET DEFAULT now()',
    );
    await runner.query(
      'CREATE INDEX "IDX_products_catalog_category_price" ON products ("categoryID", price) WHERE "isActive" = true',
    );
    await runner.query(
      'CREATE INDEX "IDX_products_catalog_brand" ON products (lower(brand)) WHERE "isActive" = true',
    );
    await runner.query(
      'CREATE INDEX "IDX_products_catalog_created" ON products ("createdAt" DESC NULLS LAST) WHERE "isActive" = true',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP INDEX "IDX_products_catalog_created"');
    await runner.query('DROP INDEX "IDX_products_catalog_brand"');
    await runner.query('DROP INDEX "IDX_products_catalog_category_price"');
    await runner.query(
      'ALTER TABLE products DROP CONSTRAINT "CHK_product_compare_price", DROP CONSTRAINT "CHK_product_brand", DROP CONSTRAINT "CHK_product_badge", DROP COLUMN "createdAt", DROP COLUMN "compareAtPrice", DROP COLUMN badge, DROP COLUMN subtitle, DROP COLUMN brand',
    );
  }
}
