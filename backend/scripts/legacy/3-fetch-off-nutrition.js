/**
 * 3-fetch-off-nutrition.js
 *
 * Builds a local nutrition cache by looking up each barcode in
 * public_barcodes against the Open Food Facts (OFF) product API.
 * Results are stored in a `nutrition_cache` table inside the same
 * base_v3.duckdb file, so re-running this script only fetches barcodes
 * that haven't been looked up yet.
 *
 * NOT TESTED against the live OFF API in this environment (network
 * restricted) -- run it yourself and report back any errors, especially
 * around the JSON response shape, which may have changed since this
 * was written.
 *
 * OFF API docs: https://openfoodfacts.github.io/openfoodfacts-server/api/
 *
 * Usage: node 3-fetch-off-nutrition.js [limit]
 *   limit = max number of NEW barcodes to fetch this run (default 500).
 *   Keep this modest and re-run periodically -- OFF asks that you not
 *   hammer their API, and this caches progress so nothing is wasted.
 */

const { DuckDBInstance } = require('@duckdb/node-api');

const LOCAL_DB = './base_v3.duckdb';
const LIMIT = parseInt(process.argv[2] || '500', 10);
const DELAY_MS = 200; // be polite to OFF's shared infrastructure

// OFF asks apps to identify themselves -- edit the contact email below
const USER_AGENT = 'AIS-Protein-Optimiser-Research/1.0 (contact: YOUR_EMAIL_HERE)';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function barcodeCandidates(barcode) {
  const core = barcode.replace(/^0+/, '') || '0'; // fully stripped of leading zeros
  const candidates = new Set([barcode, core]);
  // Common GTIN lengths: GTIN-8, UPC-A (12), EAN-13, GTIN-14
  for (const len of [8, 12, 13, 14]) {
    if (core.length <= len) candidates.add(core.padStart(len, '0'));
  }
  return Array.from(candidates);
}

async function fetchNutritionOnce(candidateBarcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${candidateBarcode}.json?fields=code,product_name,nutriments`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

  if (!res.ok) {
    return { found: false, error: `HTTP ${res.status}` };
  }

  const data = await res.json();
  if (data.status !== 1 || !data.product) {
    return { found: false };
  }

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
    await sleep(50); // short pause between format attempts for the same barcode
  }
  return { found: false };
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

  // Only pull barcodes we haven't already cached (success or confirmed miss)
  // Retry candidates: never-fetched barcodes, PLUS previously "not found"
  // ones -- worth retrying now that fetchNutrition() tries multiple
  // barcode formats. Once barcode format normalization has been stable
  // for a while, you can tighten this back to `nc.barcode IS NULL` only.
  const result = await connection.run(`
    SELECT b.barcode, b.product_id
    FROM public_barcodes b
    LEFT JOIN nutrition_cache nc ON nc.barcode = b.barcode
    WHERE (nc.barcode IS NULL OR nc.found = false)
      AND b.barcode IS NOT NULL
    LIMIT ${LIMIT};
  `);
  const pending = await result.getRowObjects();

  console.log(`Fetching nutrition data for ${pending.length} barcodes (limit ${LIMIT})...`);

  let successCount = 0;
  let missCount = 0;

  for (const row of pending) {
    const { barcode, product_id } = row;
    let outcome;
    try {
      outcome = await fetchNutrition(barcode);
    } catch (err) {
      console.error(`Barcode ${barcode}: fetch error -- ${err.message}`);
      outcome = { found: false };
    }

    if (outcome.found) {
      successCount++;
    } else {
      missCount++;
    }

    // Clear any stale cache row for this barcode first (handles retries
    // of previous misses cleanly without needing a unique constraint)
    await connection.run(`DELETE FROM nutrition_cache WHERE barcode = $barcode;`, {
      barcode: String(barcode),
    });

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

  console.log(`\nDone. ${successCount} matched, ${missCount} not found on OFF this run.`);
  console.log('Re-run this script again to fetch the next batch of un-cached barcodes.');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});