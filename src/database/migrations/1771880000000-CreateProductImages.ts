import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DEPRECATED: This migration has been superseded by 1791877300000-CreateProductImagesAfterProducts.
 *
 * Problem: This migration was created with a timestamp (1771880000000) that runs BEFORE
 * the products table is created (1791877199235-CreateProductsAndCategories), causing a
 * foreign key error on fresh databases.
 *
 * Solution: This migration is now a no-op. The actual table creation has been moved to
 * 1791877300000-CreateProductImagesAfterProducts, which runs AFTER products exist.
 *
 * Safety:
 * - Fresh DB: This does nothing; the new migration creates the table.
 * - Existing Azure DB: This was already recorded as run; new migration checks if table exists.
 */
export class CreateProductImages1771880000000 implements MigrationInterface {
  name = 'CreateProductImages1771880000000';

  async up(_queryRunner: QueryRunner): Promise<void> {
    // No-op: Table creation moved to 1791877300000-CreateProductImagesAfterProducts
    // to ensure products table exists before creating the foreign key.
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: Rollback handled by 1791877300000-CreateProductImagesAfterProducts
  }
}
