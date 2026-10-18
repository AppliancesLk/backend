require('dotenv/config');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { categories, productData } = require('./data/demo-catalog.cjs');
const { artwork, deterministicId } = require('./data/demo-art.cjs');
async function main() {
  if (process.env.NODE_ENV === 'production')
    throw new Error('This development demo seed cannot run in production.');
  const { AppDataSource } = require('../dist/database/data-source');
  AppDataSource.setOptions({ migrations: [] });
  await AppDataSource.initialize();
  const directory = path.resolve(
    process.env.MEDIA_UPLOAD_DIR ?? 'uploads/media',
  );
  try {
    const required = {
      products: [
        'description',
        'features',
        'boxContents',
        'warranty',
        'ratingAverage',
        'ratingCount',
        'brand',
        'subtitle',
        'createdAt',
      ],
      categories: ['imageUrl'],
    };
    for (const [table, columns] of Object.entries(required)) {
      const rows = await AppDataSource.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',
        [table],
      );
      const available = new Set(rows.map((row) => row.column_name));
      if (columns.some((column) => !available.has(column)))
        throw new Error(
          'Schema is missing required fields. Run the TypeORM migrations before seeding.',
        );
    }
    if (process.argv.includes('--dry-run')) {
      console.log(
        'Schema supports the seed: 20 categories, 100 products, at least 14 specifications each, two local illustrations per product. No changes made.',
      );
      return;
    }
    await fs.mkdir(directory, { recursive: true });
    const colors = ['#1e40af', '#475569', '#cbd5e1', '#166534', '#d97706'];
    async function image(key, category, variant, back = false) {
      const filename = deterministicId(key) + '.webp';
      const target = path.join(directory, filename);
      try {
        await fs.access(target);
      } catch {
        const bytes = await sharp(
          Buffer.from(artwork(category.art, colors[variant], variant, back)),
        )
          .webp({ quality: 92 })
          .toBuffer();
        try {
          await fs.writeFile(target, bytes, { flag: 'wx' });
        } catch (error) {
          if (error.code !== 'EEXIST') throw error;
        }
      }
      return '/media/images/' + filename;
    }
    const prepared = [];
    for (const category of categories) {
      const categoryImage = await image(category.key, category, 0);
      const products = [];
      for (let variant = 0; variant < 5; variant++) {
        const data = productData(category, variant);
        products.push({
          ...data,
          images: [
            await image(data.SKU + '-front', category, variant),
            await image(data.SKU + '-detail', category, variant, true),
          ],
        });
      }
      prepared.push({ category, categoryImage, products });
    }
    let addedCategories = 0,
      addedProducts = 0;
    await AppDataSource.transaction(async (manager) => {
      // Concurrent reruns serialize without adding duplicate categories.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('appliances-demo-catalog-v1'))",
      );
      for (const { category, categoryImage, products } of prepared) {
        let rows = await manager.query(
          'SELECT "categoryID" FROM categories WHERE lower(name)=lower($1) AND "parentID" IS NULL ORDER BY "categoryID" LIMIT 1',
          [category.name],
        );
        let categoryId = rows[0]?.categoryID;
        if (!categoryId) {
          categoryId = deterministicId(category.key);
          await manager.query(
            'INSERT INTO categories ("categoryID",name,"isActive","imageUrl") VALUES ($1,$2,true,$3) ON CONFLICT ("categoryID") DO NOTHING',
            [categoryId, category.name, categoryImage],
          );
          addedCategories++;
        }
        for (const product of products) {
          const result = await manager.query(
            `INSERT INTO products ("productID",name,"SKU",price,"stockQty",images,specifications,"isActive","categoryID",brand,subtitle,badge,"compareAtPrice",description,features,"boxContents",warranty)
            VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,true,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT ("SKU") DO NOTHING RETURNING "productID"`,
            [
              deterministicId(product.SKU),
              product.name,
              product.SKU,
              product.price,
              product.stockQty,
              product.images,
              JSON.stringify(product.specifications),
              categoryId,
              product.brand,
              product.subtitle,
              product.badge,
              product.badge === 'DEAL'
                ? Math.ceil((product.price * 1.15) / 10) * 10
                : null,
              product.description,
              product.features,
              product.boxContents,
              product.warranty,
            ],
          );
          addedProducts += result.length;
        }
      }
    });
    const [summary] = await AppDataSource.query(
      `SELECT COUNT(*)::int AS products,COUNT(DISTINCT "categoryID")::int AS categories,MIN(jsonb_object_length_safe)::int AS "minimumSpecifications" FROM (SELECT "categoryID",(SELECT count(*) FROM jsonb_object_keys(specifications)) AS jsonb_object_length_safe FROM products WHERE "SKU" LIKE 'DEMO-V1-%') catalog`,
    );
    console.log(
      `Demo seed complete: added ${addedCategories} categories and ${addedProducts} products. Dataset: ${summary.categories} categories, ${summary.products} products, at least ${summary.minimumSpecifications} specifications per product. Existing records were preserved. No reviews were fabricated.`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
