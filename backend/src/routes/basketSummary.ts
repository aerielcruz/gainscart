import { Router } from 'express'
import { summariseBasket, type BasketSummaryInput } from '../services/basketSummary.js'

export const basketSummaryRouter = Router()

// Only pulls the specific fields the prompt needs off req.body, same
// whitelist approach as explain.ts -- keeps the LLM prompt built from
// known, type-checked values instead of arbitrary client input.
function parseInput(body: any): BasketSummaryInput | string {
  const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

  if (!Number.isInteger(body.itemCount) || body.itemCount <= 0) return 'itemCount must be a positive integer'
  if (!isFiniteNumber(body.totalCost)) return 'totalCost must be a number'
  if (!isFiniteNumber(body.totalProteinG)) return 'totalProteinG must be a number'
  if (!isFiniteNumber(body.totalCalories)) return 'totalCalories must be a number'
  if (!isFiniteNumber(body.totalFatG)) return 'totalFatG must be a number'
  if (!isFiniteNumber(body.totalSaturatedFatG)) return 'totalSaturatedFatG must be a number'
  if (!isFiniteNumber(body.totalCarbsG)) return 'totalCarbsG must be a number'
  if (!isFiniteNumber(body.totalSugarsG)) return 'totalSugarsG must be a number'
  if (!isFiniteNumber(body.totalFiberG)) return 'totalFiberG must be a number'
  if (!isFiniteNumber(body.totalSodiumMg)) return 'totalSodiumMg must be a number'
  if (!Array.isArray(body.topItemNames) || !body.topItemNames.every((n: unknown) => typeof n === 'string')) {
    return 'topItemNames must be an array of strings'
  }

  return {
    itemCount: body.itemCount,
    totalCost: body.totalCost,
    totalProteinG: body.totalProteinG,
    totalCalories: body.totalCalories,
    totalFatG: body.totalFatG,
    totalSaturatedFatG: body.totalSaturatedFatG,
    totalCarbsG: body.totalCarbsG,
    totalSugarsG: body.totalSugarsG,
    totalFiberG: body.totalFiberG,
    totalSodiumMg: body.totalSodiumMg,
    // Capped here (not just trusting the client) since this feeds directly
    // into an LLM prompt -- keeps prompt size bounded regardless of what a
    // client sends.
    topItemNames: body.topItemNames.slice(0, 10),
  }
}

basketSummaryRouter.post('/', async (req, res) => {
  const input = parseInput(req.body ?? {})
  if (typeof input === 'string') {
    res.status(400).json({ error: input })
    return
  }

  try {
    const summary = await summariseBasket(input)
    res.json({ summary })
  } catch (err) {
    console.error('summariseBasket failed:', err)
    res.status(502).json({ error: 'basket summary unavailable right now' })
  }
})
