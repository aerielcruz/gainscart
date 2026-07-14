import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './config/db.js'
import { healthRouter } from './routes/health.js'
import { optimiseRouter } from './routes/optimise.js'
import { explainRouter } from './routes/explain.js'
import { basketSummaryRouter } from './routes/basketSummary.js'
import { priceComparisonRouter } from './routes/priceComparison.js'
import { priceTrendRouter } from './routes/priceTrend.js'
import { surveyRouter } from './routes/survey.js'
import { warmCheapestPerProductCache, CHEAPEST_PER_PRODUCT_CACHE_TTL_MS } from './services/optimiser.js'

const app = express()
const port = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

app.use('/api/health', healthRouter)
app.use('/api/optimise', optimiseRouter)
app.use('/api/explain', explainRouter)
app.use('/api/explain-basket', basketSummaryRouter)
app.use('/api/price-comparison', priceComparisonRouter)
app.use('/api/price-trend', priceTrendRouter)
app.use('/api/survey', surveyRouter)

// Refreshed a few minutes before the cache's own TTL expires, so the
// background refresh always lands before a request could ever hit a stale/
// expired cache and pay the full cold-query cost live -- see the warning in
// optimiser.ts about that cost exceeding Render's gateway timeout.
const CACHE_REFRESH_INTERVAL_MS = CHEAPEST_PER_PRODUCT_CACHE_TTL_MS - 5 * 60 * 1000

async function main() {
  await connectDB()

  // Warm the price cache before accepting any requests -- a live HTTP
  // request must never be the one paying the ~25s+ cold-query cost (see
  // optimiser.ts). Startup takes longer as a result, which is an
  // acceptable one-time cost.
  console.log('Warming price cache...')
  await warmCheapestPerProductCache()
  console.log('Price cache warm.')

  setInterval(() => {
    warmCheapestPerProductCache().catch((err) => {
      console.error('Background price cache refresh failed (will retry on next interval):', err)
    })
  }, CACHE_REFRESH_INTERVAL_MS)

  app.listen(port, () => {
    console.log(`GainsCart API listening on port ${port}`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
