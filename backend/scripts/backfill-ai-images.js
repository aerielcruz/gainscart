/**
 * backfill-ai-images.js
 *
 * For every product eligible to appear in optimiser results (nutrition
 * matched + meets the same protein threshold optimiser.ts filters on) that
 * has no real photo (nutrition.image_url), generates a placeholder
 * illustration via Pollinations.ai -- free, keyless, no billing, same
 * "unofficial URL trick" pattern used for the Store location map. A fixed
 * seed (product_id) makes the same product always resolve to the same
 * image if regenerated.
 *
 * These are clearly labeled "AI" in the UI (see Thumbnail in App.tsx) --
 * never presented as a real product photo.
 *
 * Usage: node scripts/backfill-ai-images.js [limit] [productIds]
 *   limit = max number of products to attempt this run (default 200)
 *   productIds = optional comma-separated product_id list to scope to
 *     (e.g. the app's own current top-N by rank), instead of an arbitrary
 *     slice of the whole eligible backlog
 */
import 'dotenv/config'
import { getDb, closeDb } from './lib/mongo.js'

const LIMIT = parseInt(process.argv[2] || '200', 10)
const PRODUCT_IDS = process.argv[3] ? process.argv[3].split(',').map(Number) : null
const DELAY_MS = 3000 // be polite to a free, shared, keyless service -- also cuts down on 429s
const MIN_PROTEIN_PER_100G = 10 // mirrors optimiser.ts's eligibility filter

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildImageUrl(product) {
  const prompt = [product.brand, product.name, 'grocery product photo, white background, studio lighting']
    .filter(Boolean)
    .join(' ')
    .slice(0, 250)
  const params = new URLSearchParams({
    width: '256',
    height: '256',
    seed: String(product.product_id),
    nologo: 'true',
  })
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params}`
}

async function main() {
  const db = await getDb()
  const products = db.collection('products')

  const query = {
    'nutrition.matched': true,
    'nutrition.per_100g.protein_g': { $gte: MIN_PROTEIN_PER_100G },
    $or: [{ 'nutrition.image_url': null }, { 'nutrition.image_url': { $exists: false } }],
    'nutrition.ai_image_url': { $exists: false },
  }
  if (PRODUCT_IDS) query.product_id = { $in: PRODUCT_IDS }

  const pending = await products.find(query).limit(LIMIT).toArray()

  console.log(`Found ${pending.length} products pending an AI image (limit ${LIMIT}).`)

  let generated = 0
  let failed = 0

  for (const product of pending) {
    const url = buildImageUrl(product)

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60_000)
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      res.body?.cancel?.() // only need the headers to confirm it resolved, not the image bytes

      if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) {
        console.error(`product_id ${product.product_id}: unexpected response (${res.status})`)
        failed++
        await sleep(DELAY_MS)
        continue
      }

      await products.updateOne(
        { _id: product._id },
        { $set: { 'nutrition.ai_image_url': url, 'nutrition.ai_image_generated_at': new Date() } }
      )
      generated++
    } catch (err) {
      console.error(`product_id ${product.product_id}: ${err.message}`)
      failed++
    }

    await sleep(DELAY_MS)
  }

  console.log(`\nDone. ${generated} generated, ${failed} failed (left for next run).`)
  console.log('Re-run this script again to pick up the next batch.')

  await closeDb()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
