import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProductImages1771880000000 implements MigrationInterface {
  name = 'CreateProductImages1771880000000';

  async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`CREATE INDEX "IDX_product_images_product" ON "product_images" ("productID")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_product_images_product"`);
    await queryRunner.query(`DROP TABLE "product_images"`);
  }
}
