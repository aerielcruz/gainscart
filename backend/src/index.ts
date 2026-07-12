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

async function main() {
  await connectDB()

  app.listen(port, () => {
    console.log(`GainsCart API listening on port ${port}`)
  })
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
