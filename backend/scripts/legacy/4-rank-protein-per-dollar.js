/**
 * 4-rank-protein-per-dollar.js
 *
 * Ranks products at a given store by protein-per-dollar, using:
 *   - public_products (name, brand, size) from the base DuckDB
 *   - nutrition_cache (protein_100g, energy_kj_100g) built by
 *     3-fetch-off-nutrition.js from Open Food Facts
 *   - the remote per-store price parquet file (read live via httpfs)
 *
 * IMPORTANT ASSUMPTIONS -- adjust to match your research design:
 *
 * 1. EFFECTIVE PRICE: uses sale_price_cent if present, else
 *    original_price_cent. This ignores club_price_cent (loyalty-card
 *    price) and online_price_cent on purpose, since not every shopper
 *    has a club card -- change PRICE_EXPR below if your study assumes
 *    club pricing.
 *
 * 2. SIZE PARSING: only handles straightforward g/kg/ml/l sizes
 *    (e.g. "125g", "1kg", "500ml"). Pack-count sizes like "36pk" or
 *    "ea" can't be converted to a weight and are excluded -- these
 *    products will simply not appear in the ranking. Worth reporting
 *    as a coverage limitation in your evaluation.
 *
 * 3. MULTIPLE BARCODES PER PRODUCT: if a product has more than one
 *    barcode with different OFF matches, this picks the one with the
 *    highest protein_100g (arbitrary tie-break) -- flag this if it
 *    matters for your accuracy evaluation.
 *
 * 4. CALORIE-DENSITY FILTER: mirrors your old kJ->kcal threshold logic.
 *    KCAL_THRESHOLD below is a placeholder -- set it to whatever value
 *    your original rank-protein-per-dollar.js used.
 *
 * Usage: node 4-rank-protein-per-dollar.js <store_id>
 */

const { DuckDBInstance } = require('@duckdb/node-api');

const LOCAL_DB = './base_v3.duckdb';
const storeId = process.argv[2];
const KCAL_THRESHOLD = 0; // TODO: set your real minimum kcal/100g threshold

if (!storeId) {
  console.error('Usage: node 4-rank-protein-per-dollar.js <store_id>');
  process.exit(1);
}

const priceFileUrl = `https://assets-prod.grocer.nz/public/prices_per_store_v3/public_prices_${storeId}.parquet`;

// Effective price in cents -- see assumption (1) above
const PRICE_EXPR = `COALESCE(sp.sale_price_cent, sp.original_price_cent)`;

async function runQuery(connection, sql) {
  const result = await connection.run(sql);
  return result.getRowObjects();
}

async function main() {
  const instance = await DuckDBInstance.create(LOCAL_DB);
  const connection = await instance.connect();

  await connection.run(`INSTALL httpfs;`);
  await connection.run(`LOAD httpfs;`);

  await connection.run(`
    CREATE OR REPLACE VIEW store_prices AS
    SELECT * FROM read_parquet('${priceFileUrl}');
  `);

  const sql = `
    WITH size_parsed AS (
      SELECT
        id AS product_id,
        name,
        brand,
        size,
        CASE
          WHEN regexp_matches(lower(size), '^\\s*[\\d.]+\\s*kg')
            THEN CAST(regexp_extract(lower(size), '([\\d.]+)', 1) AS DOUBLE) * 1000
          WHEN regexp_matches(lower(size), '^\\s*[\\d.]+\\s*g')
            THEN CAST(regexp_extract(lower(size), '([\\d.]+)', 1) AS DOUBLE)
          WHEN regexp_matches(lower(size), '^\\s*[\\d.]+\\s*l')
            THEN CAST(regexp_extract(lower(size), '([\\d.]+)', 1) AS DOUBLE) * 1000
          WHEN regexp_matches(lower(size), '^\\s*[\\d.]+\\s*ml')
            THEN CAST(regexp_extract(lower(size), '([\\d.]+)', 1) AS DOUBLE)
          ELSE NULL
        END AS size_grams
      FROM public_products
      WHERE redirected_to IS NULL
    ),
    nutrition_deduped AS (
      SELECT product_id, protein_100g, energy_kj_100g, off_product_name
      FROM nutrition_cache
      WHERE found = true AND protein_100g IS NOT NULL
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY product_id ORDER BY protein_100g DESC
      ) = 1
    ),
    ranked AS (
      SELECT
        sp.product_id,
        s.name AS product_name,
        s.brand,
        s.size,
        s.size_grams,
        n.protein_100g,
        n.energy_kj_100g,
        (${PRICE_EXPR}) AS price_cent,
        (${PRICE_EXPR}) / 100.0 AS price_dollars,
        (n.protein_100g * s.size_grams / 100.0)
          / ((${PRICE_EXPR}) / 100.0) AS protein_per_dollar
      FROM store_prices sp
      JOIN size_parsed s ON s.product_id = sp.product_id
      JOIN nutrition_deduped n ON n.product_id = sp.product_id
      WHERE s.size_grams IS NOT NULL
        AND (${PRICE_EXPR}) IS NOT NULL
        AND (n.energy_kj_100g / 4.184) >= ${KCAL_THRESHOLD}
    )
    SELECT *
    FROM ranked
    ORDER BY protein_per_dollar DESC
    LIMIT 20;
  `;

  const results = await runQuery(connection, sql);

  if (results.length === 0) {
    console.log(
      'No results. Likely causes: nutrition_cache is empty or too small ' +
      '(run 3-fetch-off-nutrition.js first, possibly several times to build ' +
      'up coverage), or this store_id has no matching price rows.'
    );
    return;
  }

  console.table(results);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});