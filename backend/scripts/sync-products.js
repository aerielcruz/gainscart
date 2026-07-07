/**
 * sync-products.js
 *
 * Downloads the current base_v3.duckdb.br catalog, reads public_products +
 * public_barcodes + public_stores + public_vendors, and upserts into the
 * MongoDB `products` and `stores` collections.
 *
 * Catalog fields (name/brand/size/barcode/etc.) are refreshed on every
 * run. The nested `nutrition` object is only written via $setOnInsert, so
 * re-running this daily never clobbers nutrition data that
 * sync-nutrition.js has already fetched.
 *
 * `stores` isn't part of the schema documented in CLAUDE.md -- it's a
 * small addition so sync-prices.js can loop over every enabled store
 * instead of a hardcoded store_id.
 *
 * Usage: node scripts/sync-products.js
 */
import 'dotenv/config'
import { downloadBaseCatalog, openConnection, runQuery } from './lib/duckdb.js'
import { parseSizeGrams } from './lib/size.js'
import { getDb, closeDb } from './lib/mongo.js'

async function main() {
  const dbPath = await downloadBaseCatalog()
  const connection = await openConnection(dbPath)

  const rawProducts = await runQuery(
    connection,
    `
    SELECT p.id AS product_id, p.name, p.brand, p.unit, p.size, b.barcode
    FROM public_products p
    LEFT JOIN public_barcodes b ON b.product_id = p.id
    WHERE p.redirected_to IS NULL
  `
  )

  // A product can have more than one barcode row; keep the first one seen
  // (documented tie-break, matches legacy/4-rank-protein-per-dollar.js's
  // approach to multi-barcode products).
  const seen = new Set()
  const products = rawProducts.filter((p) => {
    if (seen.has(p.product_id)) return false
    seen.add(p.product_id)
    return true
  })

  const stores = await runQuery(
    connection,
    `
    SELECT s.id AS store_id, s.vendor_id, v.name AS vendor_name, s.name, s.is_enabled
    FROM public_stores s
    JOIN public_vendors v ON v.id = s.vendor_id
  `
  )

  console.log(`Read ${products.length} products and ${stores.length} stores from DuckDB.`)

  const db = await getDb()

  const productOps = products.map((p) => ({
    updateOne: {
      filter: { product_id: p.product_id },
      update: {
        $set: {
          name: p.name,
          brand: p.brand,
          unit: p.unit,
          size: p.size,
          size_grams: parseSizeGrams(p.size),
          barcode: p.barcode ?? null,
        },
        $setOnInsert: {
          product_id: p.product_id,
          nutrition: {
            source: null,
            off_product_name: null,
            per_100g: {
              energy_kj: null,
              protein_g: null,
              fat_g: null,
              saturated_fat_g: null,
              carbs_g: null,
              sugars_g: null,
              fiber_g: null,
              sodium_mg: null,
            },
            matched: false,
            synced_at: null,
          },
        },
      },
      upsert: true,
    },
  }))

  const storeOps = stores.map((s) => ({
    updateOne: {
      filter: { store_id: s.store_id },
      update: {
        $set: {
          vendor_id: s.vendor_id,
          vendor_name: s.vendor_name,
          name: s.name,
          is_enabled: Boolean(s.is_enabled),
        },
      },
      upsert: true,
    },
  }))

  // A single bulkWrite covering all ~100k products can exceed the
  // cluster's write time limit (seen in practice: MaxTimeMSExpired after a
  // partial write). Chunk it so each request stays comfortably fast.
  const BATCH_SIZE = 1000
  const productsCol = db.collection('products')
  let productsInserted = 0
  let productsUpdated = 0

  for (let i = 0; i < productOps.length; i += BATCH_SIZE) {
    const batch = productOps.slice(i, i + BATCH_SIZE)
    const result = await productsCol.bulkWrite(batch, { ordered: false })
    productsInserted += result.upsertedCount
    productsUpdated += result.modifiedCount
  }

  const storeResult = await db.collection('stores').bulkWrite(storeOps, { ordered: false })

  console.log(`Products: ${productsInserted} inserted, ${productsUpdated} updated.`)
  console.log(`Stores: ${storeResult.upsertedCount} inserted, ${storeResult.modifiedCount} updated.`)

  await closeDb()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
