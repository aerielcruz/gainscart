/**
 * sync-fresh-foods.js
 *
 * Fills nutrition data for weighed products (unit: 'kg' -- fresh meat, fish,
 * etc.) that Open Food Facts could never match, since these are sold under
 * store-generated scale-label barcodes rather than real GS1 barcodes (see
 * LIMITATIONS.md). Matches product names against the hand-curated category
 * table in lib/freshFoodReference.js instead of doing a barcode lookup.
 *
 * Never overwrites a genuine OFF product-specific match (a stronger
 * evidence tier than this category-level estimate -- see nutrition.source
 * in Product.ts). Re-processes products already tagged
 * nutrition.source: 'curated-reference' as well as never-matched ones, so
 * re-running after a keyword-rule fix corrects past mis-matches (e.g. a
 * newly-added exclude term) rather than leaving stale guesses in place.
 *
 * Usage: node scripts/sync-fresh-foods.js
 */
import 'dotenv/config'
import { matchFreshFoodCategory } from './lib/freshFoodReference.js'
import { getDb, closeDb } from './lib/mongo.js'

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

  const candidates = await products
    .find(
      { unit: 'kg', $or: [{ 'nutrition.matched': { $ne: true } }, { 'nutrition.source': 'curated-reference' }] },
      { projection: { name: 1, 'nutrition.source': 1 } }
    )
    .toArray()

  console.log(`Found ${candidates.length} weighed products to (re-)evaluate against the curated reference table.`)

  const byCategory = new Map()
  let unmatched = 0
  let reverted = 0

  for (const product of candidates) {
    const match = matchFreshFoodCategory(product.name)

    if (!match) {
      unmatched++
      // Was previously matched under an older/looser rule set -- revert
      // rather than leave a stale curated-reference guess in place.
      if (product.nutrition?.source === 'curated-reference') {
        reverted++
        await products.updateOne(
          { _id: product._id },
          {
            $set: {
              'nutrition.source': null,
              'nutrition.matched_category': null,
              'nutrition.per_100g': EMPTY_PER_100G,
              'nutrition.matched': false,
              'nutrition.synced_at': new Date(),
            },
          }
        )
      }
      continue
    }

    byCategory.set(match.id, (byCategory.get(match.id) ?? 0) + 1)

    await products.updateOne(
      { _id: product._id },
      {
        $set: {
          'nutrition.source': 'curated-reference',
          'nutrition.matched_category': match.id,
          'nutrition.per_100g': match.nutrition,
          'nutrition.matched': true,
          'nutrition.synced_at': new Date(),
        },
      }
    )
  }

  const totalMatched = candidates.length - unmatched
  console.log(`\nDone. ${totalMatched} matched to a curated category, ${unmatched} left unmatched (${reverted} reverted from a stale prior match).`)
  for (const [id, count] of [...byCategory.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id}: ${count}`)
  }

  await closeDb()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
