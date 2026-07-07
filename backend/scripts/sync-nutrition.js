/**
 * sync-nutrition.js
 *
 * For every product in MongoDB that hasn't been looked up on Open Food
 * Facts yet (nutrition.synced_at is unset), looks it up by barcode
 * (reusing the multi-format barcode normalization) and updates the
 * nested `nutrition` object in place.
 *
 * Both hits and misses get synced_at stamped, so a confirmed miss is
 * never re-attempted -- `matched` records the hit/miss outcome, but the
 * *selection* query keys off synced_at so it doesn't loop forever on the
 * same misses.
 *
 * Usage: node scripts/sync-nutrition.js [limit]
 *   limit = max number of products to attempt this run (default 500)
 */
import 'dotenv/config'
import { lookupNutritionByBarcode } from './lib/offLookup.js'
import { getDb, closeDb } from './lib/mongo.js'

const LIMIT = parseInt(process.argv[2] || '500', 10)
const DELAY_MS = 200 // be polite to OFF's shared infrastructure

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const EMPTY_PER_100G = {
  energy_kj: null,
  protein_g: null,
  fat_g: null,
  saturated_fat_g: null,
  carbs_g: null,
  sugars_g: null,
  fiber_g: null,
  sodium_mg: null,
}

async function main() {
  const db = await getDb()
  const products = db.collection('products')

  const pending = await products.find({ 'nutrition.synced_at': null }).limit(LIMIT).toArray()

  console.log(`Found ${pending.length} products pending nutrition lookup (limit ${LIMIT}).`)

  let matched = 0
  let missed = 0
  let skippedNoBarcode = 0

  for (const product of pending) {
    if (!product.barcode) {
      skippedNoBarcode++
      await products.updateOne(
        { _id: product._id },
        { $set: { 'nutrition.matched': false, 'nutrition.synced_at': new Date() } }
      )
      continue
    }

    let outcome
    try {
      outcome = await lookupNutritionByBarcode(product.barcode)
    } catch (err) {
      console.error(`product_id ${product.product_id}: lookup error -- ${err.message}`)
      outcome = { found: false }
    }

    if (outcome.found) matched++
    else missed++

    await products.updateOne(
      { _id: product._id },
      {
        $set: {
          'nutrition.source': outcome.found ? 'openfoodfacts' : null,
          'nutrition.off_product_name': outcome.productName ?? null,
          'nutrition.per_100g': outcome.found ? outcome.per100g : EMPTY_PER_100G,
          'nutrition.matched': outcome.found,
          'nutrition.synced_at': new Date(),
        },
      }
    )

    await sleep(DELAY_MS)
  }

  console.log(`\nDone. ${matched} matched, ${missed} not found, ${skippedNoBarcode} skipped (no barcode).`)
  console.log('Re-run this script again to pick up the next batch of un-attempted products.')

  await closeDb()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
