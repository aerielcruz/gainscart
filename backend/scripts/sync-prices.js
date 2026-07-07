/**
 * sync-prices.js
 *
 * SCOPE: limited to a curated whitelist of ~30 Auckland CBD / inner-suburb
 * stores across Woolworths, New World, and Pak'nSave -- NOT all enabled
 * stores. This was a deliberate scope-down after a full-catalog sync
 * (all 465 enabled stores) blew through the MongoDB Atlas free-tier
 * 512MB storage quota partway through (121 stores in, ~433MB, ~1.84M
 * price docs -- full coverage would need ~1.6GB). The store list below
 * was curated by matching store *names* against known Auckland suburbs;
 * there is no address/coordinate data anywhere in the Grocer.nz dataset
 * (confirmed via DESCRIBE public_stores), so "within ~10km of the CBD"
 * is a manual judgement call, not a computed distance -- treat the exact
 * boundary as approximate.
 *
 * Queries each whitelisted store's live price parquet via DuckDB's
 * httpfs extension (no full-file download, matches CLAUDE.md), and
 * inserts one `prices` document per product per store with observed_at
 * set to now.
 *
 * PRICE-TIER ASSUMPTION: effective_price_cent = COALESCE(sale_price_cent,
 * original_price_cent). Club-card and online prices are ignored on
 * purpose (not every shopper has a club card) -- ported from
 * legacy/4-rank-protein-per-dollar.js's PRICE_EXPR. Change here if the
 * research design calls for a different price tier.
 *
 * Usage: node scripts/sync-prices.js
 */
import 'dotenv/config'
import { openHttpConnection, runQuery } from './lib/duckdb.js'
import { getDb, closeDb } from './lib/mongo.js'

function priceFileUrl(storeId) {
  return `https://assets-prod.grocer.nz/public/prices_per_store_v3/public_prices_${storeId}.parquet`
}

// Auckland CBD + ~10km, curated by store name (see SCOPE note above).
const STORE_WHITELIST = [
  9, 10, 5, 124, 50, 97, 146, 98, 126, 163, 110, 90, 145, 47, 99, 106, 18, 70, // Woolworths
  316, 20646, 399, 378, 320, 142909, 308, 300, // New World
  241, 222, 242, 232, // Pak'nSave
]

async function main() {
  const db = await getDb()
  const stores = await db
    .collection('stores')
    .find({ is_enabled: true, store_id: { $in: STORE_WHITELIST } })
    .toArray()

  console.log(`Syncing prices for ${stores.length} whitelisted Auckland-area stores (of ${STORE_WHITELIST.length} requested).`)

  const connection = await openHttpConnection()
  const observedAt = new Date()
  let totalInserted = 0

  for (const store of stores) {
    const url = priceFileUrl(Number(store.store_id))
    let rows
    try {
      rows = await runQuery(
        connection,
        `
        SELECT product_id, original_price_cent, sale_price_cent, club_price_cent, online_price_cent
        FROM read_parquet('${url}')
      `
      )
    } catch (err) {
      console.error(`store_id ${store.store_id}: failed to read price parquet -- ${err.message}`)
      continue
    }

    if (rows.length === 0) continue

    const docs = rows.map((r) => ({
      product_id: r.product_id,
      store_id: store.store_id,
      store_name: store.name,
      vendor_name: store.vendor_name,
      original_price_cent: r.original_price_cent ?? null,
      sale_price_cent: r.sale_price_cent ?? null,
      club_price_cent: r.club_price_cent ?? null,
      online_price_cent: r.online_price_cent ?? null,
      effective_price_cent: r.sale_price_cent ?? r.original_price_cent ?? null,
      observed_at: observedAt,
    }))

    await db.collection('prices').insertMany(docs)
    totalInserted += docs.length
    console.log(`store_id ${store.store_id} (${store.name}): inserted ${docs.length} price docs.`)
  }

  console.log(`\nDone. ${totalInserted} price documents inserted across ${stores.length} stores.`)
  await closeDb()
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
