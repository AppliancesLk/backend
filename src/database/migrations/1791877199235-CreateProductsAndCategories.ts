import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateProductsAndCategories1791877199235 implements MigrationInterface {
    name = 'CreateProductsAndCategories1791877199235'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "products" ("productID" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "SKU" character varying NOT NULL, "price" numeric(12,2) NOT NULL, "stockQty" integer NOT NULL DEFAULT '0', "images" text array NOT NULL DEFAULT '{}', "specifications" jsonb, "isActive" boolean NOT NULL DEFAULT true, "categoryID" uuid NOT NULL, CONSTRAINT "UQ_d750d40dee7a63a316039f246be" UNIQUE ("SKU"), CONSTRAINT "PK_caa33ce35fe9bdd6e7fd6268ac4" PRIMARY KEY ("productID"))`);
        await queryRunner.query(`CREATE TABLE "categories" ("categoryID" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "parentID" uuid, CONSTRAINT "PK_13da6162629fdaeccef5b784271" PRIMARY KEY ("categoryID"))`);
        await queryRunner.query(`ALTER TABLE "products" ADD CONSTRAINT "FK_16bde4164ef1b208fdd30b0ce49" FOREIGN KEY ("categoryID") REFERENCES "categories"("categoryID") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "categories" ADD CONSTRAINT "FK_d5e31feaf3ce60ee212a183e7b1" FOREIGN KEY ("parentID") REFERENCES "categories"("categoryID") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "categories" DROP CONSTRAINT "FK_d5e31feaf3ce60ee212a183e7b1"`);
        await queryRunner.query(`ALTER TABLE "products" DROP CONSTRAINT "FK_16bde4164ef1b208fdd30b0ce49"`);
        await queryRunner.query(`DROP TABLE "categories"`);
        await queryRunner.query(`DROP TABLE "products"`);
    }

}
