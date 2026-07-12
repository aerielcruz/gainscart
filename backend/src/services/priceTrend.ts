// On-demand price trend lookup, querying Grocer.nz's per-product price
// history parquet directly via DuckDB's httpfs extension (same technique
// scripts/lib/duckdb.js uses for the sync pipeline) rather than a batch
// sync -- price_history covers the full ~109K product catalog, so
// pre-syncing all of it on the same schedule as nutrition would take a
// similar order of magnitude of time (see LIMITATIONS.md's ~26hr nutrition
// sync) for data most of which would never be looked at. Fetching lazily
// per product, only when a user actually views that item, keeps this
// bounded to what's actually used. This is the one place DuckDB is queried
// from the runtime API rather than a pipeline script -- see optimiser.ts's
// note that DuckDB is otherwise ETL-only; a deliberate, scoped exception
// for a case where pre-computing for the full catalog isn't practical.
import { DuckDBInstance } from '@duckdb/node-api'

export interface PriceTrend {
  currentPriceDollars: number
  weekAgoPriceDollars: number | null
  changePct: number | null
  historyPoints: number
}

// price_history updates weekly (Tuesdays ~3am NZ time per CLAUDE.md), so a
// few hours of cache staleness can't hide new data -- just avoids
// re-fetching+parsing the same remote parquet file on every page view.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const cache = new Map<number, { data: PriceTrend | null; expiresAt: number }>()

function priceHistoryUrl(productId: number) {
  return `https://assets-prod.grocer.nz/public/price_history_v3/price_history_${productId}.parquet`
}

export async function getPriceTrend(productId: number): Promise<PriceTrend | null> {
  const cached = cache.get(productId)
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const instance = await DuckDBInstance.create(':memory:')
  const connection = await instance.connect()
  await connection.run('INSTALL httpfs;')
  await connection.run('LOAD httpfs;')

  let data: PriceTrend | null = null
  try {
    // NOTE: price_history_v3 parquet files only have (updated_at,
    // store_id, price_cent) -- despite CLAUDE.md describing "same price
    // columns as" the live per-store prices parquet (original/sale/club/
    // online split). Confirmed via DESCRIBE against a real file; no
    // price-tier choice to make here since there's only one price column.
    // MIN across stores at each timestamp -- consistent with the
    // optimiser's own "shopper picks whichever store is currently
    // cheapest" logic (see getOptimisedList), rather than pinning to one
    // specific store_id.
    const result = await connection.run(`
      SELECT
        updated_at,
        MIN(price_cent) AS effective_price_cent
      FROM read_parquet('${priceHistoryUrl(productId)}')
      WHERE price_cent IS NOT NULL
      GROUP BY updated_at
      ORDER BY updated_at
    `)
    const rows = (await result.getRowObjects()) as {
      updated_at: unknown
      effective_price_cent: bigint | number
    }[]

    if (rows.length > 0) {
      const latest = rows[rows.length - 1]
      const latestDate = new Date(String(latest.updated_at))
      const weekAgoCutoff = new Date(latestDate.getTime() - 7 * 24 * 60 * 60 * 1000)

      // Closest observation at or before the 7-day-ago cutoff, scanning
      // from the end since rows are ordered ascending by time.
      let weekAgoRow: (typeof rows)[number] | undefined
      for (let i = rows.length - 1; i >= 0; i--) {
        if (new Date(String(rows[i].updated_at)) <= weekAgoCutoff) {
          weekAgoRow = rows[i]
          break
        }
      }

      const currentPriceDollars = Number(latest.effective_price_cent) / 100
      const weekAgoPriceDollars = weekAgoRow ? Number(weekAgoRow.effective_price_cent) / 100 : null
      const changePct =
        weekAgoPriceDollars && weekAgoPriceDollars > 0
          ? ((currentPriceDollars - weekAgoPriceDollars) / weekAgoPriceDollars) * 100
          : null

      data = { currentPriceDollars, weekAgoPriceDollars, changePct, historyPoints: rows.length }
    }
  } catch (err) {
    // No price_history file for this product (never priced, too new, or
    // an id Grocer doesn't track history for) -- "no trend data," not an
    // error to surface to the client. Logged so a genuine query bug is
    // still visible in the server console rather than indistinguishable
    // from a missing file.
    console.error(`getPriceTrend(${productId}) failed:`, err instanceof Error ? err.message : err)
    data = null
  } finally {
    connection.closeSync()
    instance.closeSync()
  }

  cache.set(productId, { data, expiresAt: Date.now() + CACHE_TTL_MS })
  return data
}
