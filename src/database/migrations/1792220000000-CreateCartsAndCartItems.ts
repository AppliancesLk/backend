import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCartsAndCartItems1792220000000 implements MigrationInterface {
  name = 'CreateCartsAndCartItems1792220000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "carts" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "userId" uuid NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_carts" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_carts_user" UNIQUE ("userId"),
      CONSTRAINT "FK_carts_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(`CREATE TABLE "cart_items" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "cartId" uuid NOT NULL,
      "productId" uuid NOT NULL,
      "quantity" integer NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
      CONSTRAINT "PK_cart_items" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_cart_items_cart_product" UNIQUE ("cartId", "productId"),
      CONSTRAINT "CHK_cart_items_positive_quantity" CHECK ("quantity" > 0),
      CONSTRAINT "FK_cart_items_cart" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_cart_items_product" FOREIGN KEY ("productId") REFERENCES "products"("productID") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_cart_items_product" ON "cart_items" ("productId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "cart_items"');
    await queryRunner.query('DROP TABLE "carts"');
  }
}
