import { Router } from 'express'
import { getPriceTrend } from '../services/priceTrend.js'

export const priceTrendRouter = Router()

priceTrendRouter.get('/:productId', async (req, res) => {
  const productId = Number(req.params.productId)
  if (!Number.isFinite(productId) || productId <= 0) {
    res.status(400).json({ error: 'productId must be a positive number' })
    return
  }

  try {
    const trend = await getPriceTrend(productId)
    res.json({ trend })
  } catch (err) {
    console.error('getPriceTrend failed:', err)
    res.status(502).json({ error: 'price trend unavailable right now' })
  }
})
