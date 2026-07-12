import { Router } from 'express'
import { explainPick, type ExplainableItem } from '../services/explain.js'

export const explainRouter = Router()

const NUTRITION_SOURCES = new Set(['openfoodfacts', 'curated-reference', null])

// Only pulls the specific fields the prompt needs off req.body, rather than
// forwarding the body wholesale -- keeps the LLM prompt built from known,
// type-checked values instead of arbitrary client input.
function parseItem(body: any): ExplainableItem | string {
  const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

  if (typeof body.name !== 'string' || !body.name.trim()) return 'name is required'
  if (typeof body.store_name !== 'string' || !body.store_name.trim()) return 'store_name is required'
  if (!isFiniteNumber(body.price_dollars)) return 'price_dollars must be a number'
  if (!isFiniteNumber(body.protein_g)) return 'protein_g must be a number'
  if (!isFiniteNumber(body.kcal)) return 'kcal must be a number'
  if (!isFiniteNumber(body.protein_per_dollar)) return 'protein_per_dollar must be a number'
  if (!isFiniteNumber(body.protein_pct_of_calories)) return 'protein_pct_of_calories must be a number'
  if (!NUTRITION_SOURCES.has(body.nutrition_source ?? null)) return 'nutrition_source is invalid'

  return {
    name: body.name,
    brand: typeof body.brand === 'string' ? body.brand : null,
    size: typeof body.size === 'string' ? body.size : null,
    store_name: body.store_name,
    price_dollars: body.price_dollars,
    protein_g: body.protein_g,
    kcal: body.kcal,
    protein_per_dollar: body.protein_per_dollar,
    protein_pct_of_calories: body.protein_pct_of_calories,
    nutrition_source: body.nutrition_source ?? null,
  }
}

explainRouter.post('/', async (req, res) => {
  const item = parseItem(req.body ?? {})
  if (typeof item === 'string') {
    res.status(400).json({ error: item })
    return
  }

  try {
    const explanation = await explainPick(item)
    res.json({ explanation })
  } catch (err) {
    console.error('explainPick failed:', err)
    res.status(502).json({ error: 'explanation unavailable right now' })
  }
})
