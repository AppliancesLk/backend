import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddProductDetailsCategoryImagesAndReviews1792280000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE categories ADD COLUMN "imageUrl" varchar(2048)',
    );
    await runner.query(`ALTER TABLE products ADD COLUMN description text NOT NULL DEFAULT '', ADD COLUMN features text[] NOT NULL DEFAULT '{}', ADD COLUMN "boxContents" text[] NOT NULL DEFAULT '{}', ADD COLUMN warranty varchar(300) NOT NULL DEFAULT '', ADD COLUMN "ratingAverage" numeric(3,2) NOT NULL DEFAULT 0, ADD COLUMN "ratingCount" integer NOT NULL DEFAULT 0,
      ADD CONSTRAINT "CHK_product_rating_summary" CHECK ("ratingAverage" BETWEEN 0 AND 5 AND "ratingCount">=0),
      ADD CONSTRAINT "CHK_product_detail_lengths" CHECK (char_length(description)<=10000 AND cardinality(features)<=20 AND cardinality("boxContents")<=30)`);
    await runner.query(`CREATE TABLE product_reviews (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "productId" uuid NOT NULL REFERENCES products("productID") ON DELETE CASCADE,
      "customerId" uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT, rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
      title varchar(120) NOT NULL CHECK (char_length(btrim(title))>=2), body varchar(3000) NOT NULL CHECK (char_length(btrim(body))>=10),
      "verifiedPurchase" boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_product_reviews_customer" UNIQUE ("productId","customerId")
    )`);
    await runner.query(
      'CREATE INDEX "IDX_product_reviews_created" ON product_reviews ("productId","createdAt" DESC)',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE product_reviews');
    await runner.query(
      'ALTER TABLE products DROP CONSTRAINT "CHK_product_detail_lengths", DROP CONSTRAINT "CHK_product_rating_summary", DROP COLUMN description, DROP COLUMN features, DROP COLUMN "boxContents", DROP COLUMN warranty, DROP COLUMN "ratingAverage", DROP COLUMN "ratingCount"',
    );
    await runner.query('ALTER TABLE categories DROP COLUMN "imageUrl"');
  }
}
