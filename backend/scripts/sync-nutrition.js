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
 * ALSO backfills `nutrition.dietary` (vegan/vegetarian/allergens) and
 * `nutrition.image_url` onto already-matched products from before those
 * fields existed -- those never requested them from OFF the first time
 * around. Backfill rows are distinguished by already having synced_at
 * set; only `dietary`/`image_url` are touched for them, per_100g/matched/
 * synced_at are left alone.
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

const EMPTY_DIETARY = { vegan: null, vegetarian: null, allergens: [] }

async function main() {
  const db = await getDb()
  const products = db.collection('products')

  const pending = await products
    .find({
      $or: [
        { 'nutrition.synced_at': null },
        { 'nutrition.matched': true, 'nutrition.dietary': { $exists: false } },
        { 'nutrition.matched': true, 'nutrition.image_url': { $exists: false } },
      ],
    })
    .limit(LIMIT)
    .toArray()

  console.log(`Found ${pending.length} products pending nutrition/dietary/image lookup (limit ${LIMIT}).`)

  let matched = 0
  let missed = 0
  let skippedNoBarcode = 0
  let dietaryBackfilled = 0
  let curatedStamped = 0

  for (const product of pending) {
    const isDietaryBackfill = product.nutrition.synced_at != null

    if (!product.barcode) {
      if (product.nutrition.source === 'curated-reference') {
        // Weighed/fresh products matched via the curated reference table
        // (freshFoodReference.js) are matched by name, not barcode -- they
        // use store-generated scale-label codes, never real GS1 barcodes,
        // so they legitimately have no barcode despite being correctly
        // matched:true. Stamp the fields this script would otherwise
        // backfill so they stop showing up as pending, without touching
        // matched/source/per_100g. (Previously this fell through to the
        // branch below and incorrectly flipped matched to false -- see
        // git history.)
        curatedStamped++
        await products.updateOne(
          { _id: product._id },
          { $set: { 'nutrition.dietary': EMPTY_DIETARY, 'nutrition.image_url': null } }
        )
        continue
      }

      // Only genuinely new, never-matched attempts can legitimately lack
      // a barcode here.
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

    if (isDietaryBackfill) {
      dietaryBackfilled++
      await products.updateOne(
        { _id: product._id },
        {
          $set: {
            'nutrition.dietary': outcome.found ? outcome.dietary : EMPTY_DIETARY,
            'nutrition.image_url': outcome.found ? outcome.imageUrl ?? null : null,
          },
        }
      )
      await sleep(DELAY_MS)
      continue
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
          'nutrition.dietary': outcome.found ? outcome.dietary : EMPTY_DIETARY,
          'nutrition.image_url': outcome.found ? outcome.imageUrl ?? null : null,
          'nutrition.matched': outcome.found,
          'nutrition.synced_at': new Date(),
        },
      }
    )

    await sleep(DELAY_MS)
  }

  console.log(
    `\nDone. ${matched} matched, ${missed} not found, ${skippedNoBarcode} skipped (no barcode), ${dietaryBackfilled} dietary-only backfills, ${curatedStamped} curated-reference (no barcode, already matched).`
  )
  console.log('Re-run this script again to pick up the next batch.')

  await closeDb()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
