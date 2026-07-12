import { Router } from 'express'
import { Price } from '../models/Price.js'

export const priceComparisonRouter = Router()

// Shows every tracked store's current price for a product, not just the
// cheapest one the optimiser picked -- purely a re-read of data already
// synced into `prices`, no external calls.
priceComparisonRouter.get('/:productId', async (req, res) => {
  const productId = Number(req.params.productId)
  if (!Number.isFinite(productId) || productId <= 0) {
    res.status(400).json({ error: 'productId must be a positive number' })
    return
  }

  try {
    const priceDocs = await Price.find(
      { product_id: productId, effective_price_cent: { $ne: null } },
      { store_id: 1, store_name: 1, vendor_name: 1, effective_price_cent: 1, observed_at: 1 }
    ).lean()

    // Latest observation per store -- same "most recent wins" rule the
    // optimiser uses, just not collapsed down to a single cheapest price.
    const latestByStore = new Map<number, (typeof priceDocs)[number]>()
    for (const doc of priceDocs) {
      const existing = latestByStore.get(doc.store_id)
      if (!existing || doc.observed_at > existing.observed_at) {
        latestByStore.set(doc.store_id, doc)
      }
    }

    const stores = Array.from(latestByStore.values())
      .map((d) => ({
        store_id: d.store_id,
        store_name: d.store_name,
        vendor_name: d.vendor_name,
        price_dollars: (d.effective_price_cent as number) / 100,
      }))
      .sort((a, b) => a.price_dollars - b.price_dollars)

    res.json({ stores })
  } catch (err) {
    console.error('priceComparison failed:', err)
    res.status(500).json({ error: 'internal error fetching price comparison' })
  }
})
