/**
 * 6-fetch-all-nutrition.js
 *
 * Wrapper that repeatedly runs the same fetch-and-cache logic as
 * 3-fetch-off-nutrition.js in batches, until every barcode in
 * public_barcodes has been attempted at least once. Safe to stop
 * (Ctrl+C) and re-run later -- progress is cached in nutrition_cache.
 *
 * Usage: node 6-fetch-all-nutrition.js [batchSize]
 *   batchSize = how many barcodes to fetch per batch (default 500)
 */

const { DuckDBInstance } = require('@duckdb/node-api');

const LOCAL_DB = './base_v3.duckdb';
const BATCH_SIZE = parseInt(process.argv[2] || '500', 10);
const DELAY_MS = 200;
const USER_AGENT = 'AIS-Protein-Optimiser-Research/1.0 (contact: YOUR_EMAIL_HERE)';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function barcodeCandidates(barcode) {
  const core = barcode.replace(/^0+/, '') || '0';
  const candidates = new Set([barcode, core]);
  for (const len of [8, 12, 13, 14]) {
    if (core.length <= len) candidates.add(core.padStart(len, '0'));
  }
  return Array.from(candidates);
}

async function fetchNutritionOnce(candidateBarcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${candidateBarcode}.json?fields=code,product_name,nutriments`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) return { found: false, error: `HTTP ${res.status}` };

  const data = await res.json();
  if (data.status !== 1 || !data.product) return { found: false };

  const nutriments = data.product.nutriments || {};
  return {
    found: true,
    productName: data.product.product_name || null,
    protein100g: nutriments['proteins_100g'] ?? null,
    energyKj100g: nutriments['energy-kj_100g'] ?? nutriments['energy_100g'] ?? null,
  };
}

async function fetchNutrition(barcode) {
  for (const candidate of barcodeCandidates(barcode)) {
    const outcome = await fetchNutritionOnce(candidate);
    if (outcome.found) return outcome;
    await sleep(50);
  }
  return { found: false };
}

async function runBatch(connection) {
  const result = await connection.run(`
    SELECT b.barcode, b.product_id
    FROM public_barcodes b
    LEFT JOIN nutrition_cache nc ON nc.barcode = b.barcode
    WHERE nc.barcode IS NULL
      AND b.barcode IS NOT NULL
    LIMIT ${BATCH_SIZE};
  `);
  const pending = await result.getRowObjects();

  for (const row of pending) {
    const { barcode, product_id } = row;
    let outcome;
    try {
      outcome = await fetchNutrition(barcode);
    } catch (err) {
      outcome = { found: false };
    }

    await connection.run(
      `INSERT INTO nutrition_cache VALUES ($barcode, $product_id, $protein, $kj, $name, $found, now());`,
      {
        barcode: String(barcode),
        product_id,
        protein: outcome.protein100g ?? null,
        kj: outcome.energyKj100g ?? null,
        name: outcome.productName ?? null,
        found: outcome.found,
      }
    );

    await sleep(DELAY_MS);
  }

  return pending.length;
}

async function main() {
  const instance = await DuckDBInstance.create(LOCAL_DB);
  const connection = await instance.connect();

  await connection.run(`
    CREATE TABLE IF NOT EXISTS nutrition_cache (
      barcode VARCHAR,
      product_id INTEGER,
      protein_100g DOUBLE,
      energy_kj_100g DOUBLE,
      off_product_name VARCHAR,
      found BOOLEAN,
      fetched_at TIMESTAMP
    );
  `);

  let totalDone = 0;
  let batchNum = 0;

  while (true) {
    batchNum++;
    const processed = await runBatch(connection);
    totalDone += processed;
    console.log(`Batch ${batchNum}: processed ${processed} barcodes (total so far: ${totalDone})`);

    if (processed === 0) {
      console.log('\nAll barcodes attempted at least once.');
      break;
    }
  }

  const stats = await connection.run(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN found THEN 1 ELSE 0 END) AS matched
    FROM nutrition_cache;
  `);
  const [row] = await stats.getRowObjects();
  const pct = ((Number(row.matched) / Number(row.total)) * 100).toFixed(1);
  console.log(`\nFinal coverage: ${row.matched} / ${row.total} barcodes matched (${pct}%)`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});