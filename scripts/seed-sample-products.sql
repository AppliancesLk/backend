BEGIN;

-- =========================================================
-- Appliances.lk Development Seed Data
-- ---------------------------------------------------------
-- Purpose:
--   Insert sample parent categories, subcategories,
--   and 50 demo products for local development/testing.
--
-- Important:
--   - Run this only on a development database.
--   - This is NOT a schema migration.
--   - The script is designed to avoid duplicate seed data.
-- =========================================================


-- =========================================================
-- 1. ENSURE REQUIRED UUID EXTENSION EXISTS
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- =========================================================
-- 2. TEMPORARY CATEGORY MAP TABLES
-- ---------------------------------------------------------
-- These tables only exist during this SQL session.
-- They help us keep track of generated UUIDs.
-- =========================================================

CREATE TEMP TABLE seed_parent_categories (
    seed_key TEXT PRIMARY KEY,
    category_id UUID NOT NULL
);

CREATE TEMP TABLE seed_subcategories (
    seed_key TEXT PRIMARY KEY,
    category_id UUID NOT NULL,
    display_name TEXT NOT NULL
);


-- =========================================================
-- 3. INSERT PARENT CATEGORIES
-- ---------------------------------------------------------
-- Only insert them if they do not already exist.
-- =========================================================

WITH inserted AS (
    INSERT INTO categories (
        "name",
        "isActive",
        "parentID"
    )
    SELECT
        seed.name,
        TRUE,
        NULL
    FROM (
        VALUES
            ('Kitchen Appliances'),
            ('Home Appliances'),
            ('Personal Care'),
            ('Computing & Office'),
            ('Audio & Entertainment')
    ) AS seed(name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM categories c
        WHERE LOWER(c."name") = LOWER(seed.name)
          AND c."parentID" IS NULL
    )
    RETURNING
        "categoryID",
        "name"
)

INSERT INTO seed_parent_categories (
    seed_key,
    category_id
)
SELECT
    CASE "name"
        WHEN 'Kitchen Appliances'
            THEN 'kitchen'
        WHEN 'Home Appliances'
            THEN 'home'
        WHEN 'Personal Care'
            THEN 'personal'
        WHEN 'Computing & Office'
            THEN 'computing'
        WHEN 'Audio & Entertainment'
            THEN 'audio'
    END,
    "categoryID"
FROM inserted;


-- =========================================================
-- 4. LOAD EXISTING PARENT CATEGORIES INTO TEMP MAP
-- ---------------------------------------------------------
-- This makes the script reusable even if parent categories
-- already exist.
-- =========================================================

INSERT INTO seed_parent_categories (
    seed_key,
    category_id
)
SELECT
    CASE c."name"
        WHEN 'Kitchen Appliances'
            THEN 'kitchen'
        WHEN 'Home Appliances'
            THEN 'home'
        WHEN 'Personal Care'
            THEN 'personal'
        WHEN 'Computing & Office'
            THEN 'computing'
        WHEN 'Audio & Entertainment'
            THEN 'audio'
    END,
    c."categoryID"
FROM categories c
WHERE c."name" IN (
    'Kitchen Appliances',
    'Home Appliances',
    'Personal Care',
    'Computing & Office',
    'Audio & Entertainment'
)
AND c."parentID" IS NULL
ON CONFLICT (seed_key) DO NOTHING;


-- =========================================================
-- 5. INSERT SUBCATEGORIES
-- =========================================================

WITH subcategory_seed AS (
    SELECT
        'refrigerators'::TEXT AS seed_key,
        'Refrigerators'::TEXT AS name,
        'kitchen'::TEXT AS parent_key

    UNION ALL
    SELECT
        'microwaves',
        'Microwave Ovens',
        'kitchen'

    UNION ALL
    SELECT
        'rice-cookers',
        'Rice Cookers',
        'kitchen'

    UNION ALL
    SELECT
        'washing-machines',
        'Washing Machines',
        'home'

    UNION ALL
    SELECT
        'air-conditioners',
        'Air Conditioners',
        'home'

    UNION ALL
    SELECT
        'vacuum-cleaners',
        'Vacuum Cleaners',
        'home'

    UNION ALL
    SELECT
        'hair-dryers',
        'Hair Dryers',
        'personal'

    UNION ALL
    SELECT
        'shavers',
        'Electric Shavers',
        'personal'

    UNION ALL
    SELECT
        'laptops',
        'Laptops',
        'computing'

    UNION ALL
    SELECT
        'monitors',
        'Monitors',
        'computing'

    UNION ALL
    SELECT
        'printers',
        'Printers',
        'computing'

    UNION ALL
    SELECT
        'headphones',
        'Headphones',
        'audio'

    UNION ALL
    SELECT
        'speakers',
        'Bluetooth Speakers',
        'audio'

    UNION ALL
    SELECT
        'sound-bars',
        'Sound Bars',
        'audio'
),

inserted AS (
    INSERT INTO categories (
        "name",
        "isActive",
        "parentID"
    )
    SELECT
        seed.name,
        TRUE,
        parent.category_id
    FROM subcategory_seed seed
    JOIN seed_parent_categories parent
        ON parent.seed_key = seed.parent_key
    WHERE NOT EXISTS (
        SELECT 1
        FROM categories c
        WHERE LOWER(c."name") = LOWER(seed.name)
          AND c."parentID" = parent.category_id
    )
    RETURNING
        "categoryID",
        "name"
)

INSERT INTO seed_subcategories (
    seed_key,
    category_id,
    display_name
)
SELECT
    CASE "name"
        WHEN 'Refrigerators'
            THEN 'refrigerators'
        WHEN 'Microwave Ovens'
            THEN 'microwaves'
        WHEN 'Rice Cookers'
            THEN 'rice-cookers'
        WHEN 'Washing Machines'
            THEN 'washing-machines'
        WHEN 'Air Conditioners'
            THEN 'air-conditioners'
        WHEN 'Vacuum Cleaners'
            THEN 'vacuum-cleaners'
        WHEN 'Hair Dryers'
            THEN 'hair-dryers'
        WHEN 'Electric Shavers'
            THEN 'shavers'
        WHEN 'Laptops'
            THEN 'laptops'
        WHEN 'Monitors'
            THEN 'monitors'
        WHEN 'Printers'
            THEN 'printers'
        WHEN 'Headphones'
            THEN 'headphones'
        WHEN 'Bluetooth Speakers'
            THEN 'speakers'
        WHEN 'Sound Bars'
            THEN 'sound-bars'
    END,
    "categoryID",
    "name"
FROM inserted;


-- =========================================================
-- 6. LOAD EXISTING SUBCATEGORIES INTO TEMP MAP
-- ---------------------------------------------------------
-- This allows rerunning the script safely.
-- =========================================================

INSERT INTO seed_subcategories (
    seed_key,
    category_id,
    display_name
)
SELECT
    CASE c."name"
        WHEN 'Refrigerators'
            THEN 'refrigerators'
        WHEN 'Microwave Ovens'
            THEN 'microwaves'
        WHEN 'Rice Cookers'
            THEN 'rice-cookers'
        WHEN 'Washing Machines'
            THEN 'washing-machines'
        WHEN 'Air Conditioners'
            THEN 'air-conditioners'
        WHEN 'Vacuum Cleaners'
            THEN 'vacuum-cleaners'
        WHEN 'Hair Dryers'
            THEN 'hair-dryers'
        WHEN 'Electric Shavers'
            THEN 'shavers'
        WHEN 'Laptops'
            THEN 'laptops'
        WHEN 'Monitors'
            THEN 'monitors'
        WHEN 'Printers'
            THEN 'printers'
        WHEN 'Headphones'
            THEN 'headphones'
        WHEN 'Bluetooth Speakers'
            THEN 'speakers'
        WHEN 'Sound Bars'
            THEN 'sound-bars'
    END,
    c."categoryID",
    c."name"
FROM categories c
JOIN categories parent
    ON parent."categoryID" = c."parentID"
WHERE c."name" IN (
    'Refrigerators',
    'Microwave Ovens',
    'Rice Cookers',
    'Washing Machines',
    'Air Conditioners',
    'Vacuum Cleaners',
    'Hair Dryers',
    'Electric Shavers',
    'Laptops',
    'Monitors',
    'Printers',
    'Headphones',
    'Bluetooth Speakers',
    'Sound Bars'
)
ON CONFLICT (seed_key) DO NOTHING;


-- =========================================================
-- 7. INSERT 50 SAMPLE PRODUCTS
-- ---------------------------------------------------------
-- Each product receives:
--   - unique SKU
--   - price
--   - stock quantity
--   - 2 image URLs
--   - JSONB specifications
--   - one subcategory
--
-- Existing products with the same seed SKU are skipped.
-- =========================================================

WITH product_seed AS (
    SELECT
        gs AS product_number,

        CASE ((gs - 1) % 14)
            WHEN 0 THEN 'air-conditioners'
            WHEN 1 THEN 'hair-dryers'
            WHEN 2 THEN 'headphones'
            WHEN 3 THEN 'laptops'
            WHEN 4 THEN 'microwaves'
            WHEN 5 THEN 'monitors'
            WHEN 6 THEN 'printers'
            WHEN 7 THEN 'refrigerators'
            WHEN 8 THEN 'rice-cookers'
            WHEN 9 THEN 'shavers'
            WHEN 10 THEN 'sound-bars'
            WHEN 11 THEN 'speakers'
            WHEN 12 THEN 'vacuum-cleaners'
            WHEN 13 THEN 'washing-machines'
        END AS subcategory_key

    FROM generate_series(1, 50) AS gs
),

prepared_products AS (
    SELECT
        ps.product_number,

        sc.display_name
            || ' Demo Model '
            || LPAD(
                ps.product_number::TEXT,
                2,
                '0'
            ) AS product_name,

        'DEMO-'
            || UPPER(
                REPLACE(
                    sc.seed_key,
                    '-',
                    ''
                )
            )
            || '-'
            || LPAD(
                ps.product_number::TEXT,
                3,
                '0'
            ) AS sku,

        ROUND(
            (
                2500
                + (
                    ps.product_number * 4375.55
                )
            )::NUMERIC,
            2
        ) AS price,

        (
            ps.product_number * 3
        ) % 45 AS stock_quantity,

        ARRAY[
            'https://picsum.photos/seed/appliance-'
                || ps.product_number
                || '-1/600/400',

            'https://picsum.photos/seed/appliance-'
                || ps.product_number
                || '-2/600/400'
        ]::TEXT[] AS image_urls,

        jsonb_build_object(
            'brand',
            CASE ps.product_number % 5
                WHEN 0 THEN 'Samsung'
                WHEN 1 THEN 'LG'
                WHEN 2 THEN 'Panasonic'
                WHEN 3 THEN 'Philips'
                ELSE 'Sony'
            END,

            'model',
            'MODEL-'
                || LPAD(
                    ps.product_number::TEXT,
                    3,
                    '0'
                ),

            'warranty',
            CASE
                WHEN ps.product_number % 3 = 0
                    THEN '2 Years'
                ELSE '1 Year'
            END,

            'demoProduct',
            TRUE
        ) AS specifications,

        sc.category_id

    FROM product_seed ps

    JOIN seed_subcategories sc
        ON sc.seed_key = ps.subcategory_key
)

INSERT INTO products (
    "name",
    "SKU",
    "price",
    "stockQty",
    "images",
    "specifications",
    "isActive",
    "categoryID"
)
SELECT
    pp.product_name,
    pp.sku,
    pp.price,
    pp.stock_quantity,
    pp.image_urls,
    pp.specifications,
    TRUE,
    pp.category_id

FROM prepared_products pp

WHERE NOT EXISTS (
    SELECT 1
    FROM products p
    WHERE p."SKU" = pp.sku
);


-- =========================================================
-- 8. COMMIT
-- =========================================================

COMMIT;


-- =========================================================
-- 9. VERIFICATION QUERIES
-- ---------------------------------------------------------
-- These run after the transaction and show what exists.
-- =========================================================

SELECT
    COUNT(*) AS total_categories
FROM categories;


SELECT
    COUNT(*) AS total_products
FROM products;


SELECT
    child."categoryID",
    child."name" AS category,
    parent."name" AS parent_category
FROM categories child
LEFT JOIN categories parent
    ON child."parentID" = parent."categoryID"
ORDER BY
    parent."name",
    child."name";


SELECT
    c."name" AS category,
    COUNT(p."productID") AS product_count
FROM categories c
LEFT JOIN products p
    ON p."categoryID" = c."categoryID"
GROUP BY
    c."categoryID",
    c."name"
ORDER BY
    product_count DESC,
    c."name";


SELECT
    p."productID",
    p."name",
    p."SKU",
    p."price",
    p."stockQty",
    c."name" AS category
FROM products p
JOIN categories c
    ON c."categoryID" = p."categoryID"
WHERE p."SKU" LIKE 'DEMO-%'
ORDER BY
    c."name",
    p."name";