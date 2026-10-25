import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the product_images table AFTER the products table exists.
 *
 * This migration supersedes 1771880000000-CreateProductImages, which had an
 * incorrect timestamp that caused it to run before products existed.
 *
 * Safety:
 * - Fresh DB: Creates the product_images table with proper FK to products.
 * - Existing Azure DB: If table already exists (from old migration), skips creation.
 */
export class CreateProductImagesAfterProducts1791877300000
  implements MigrationInterface
{
  name = 'CreateProductImagesAfterProducts1791877300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('product_images');
    if (tableExists) {
      // Table already exists (created by old migration on existing Azure DB)
      return;
    }

    // Create the product_images table with FK to products
    await queryRunner.query(`
      CREATE TABLE "product_images" (
        "imageID" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "productID" uuid NOT NULL,
        "blobName" character varying(512) NOT NULL,
        "contentType" character varying(100) NOT NULL,
        "sizeBytes" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_images" PRIMARY KEY ("imageID"),
        CONSTRAINT "UQ_product_images_blob_name" UNIQUE ("blobName"),
        CONSTRAINT "FK_product_images_product" FOREIGN KEY ("productID") REFERENCES "products"("productID") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_product_images_product" ON "product_images" ("productID")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('product_images');
    if (!tableExists) {
      // Table doesn't exist, nothing to drop
      return;
    }

    // Check if index exists before dropping
    const indexExists = await queryRunner.query(`
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'IDX_product_images_product'
    `);
    if (indexExists.length > 0) {
      await queryRunner.query(`DROP INDEX "IDX_product_images_product"`);
    }

    await queryRunner.query(`DROP TABLE "product_images"`);
  }
}
