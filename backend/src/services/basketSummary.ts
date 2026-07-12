// Whole-basket AI summary -- like explain.ts's per-item "Why this pick?"
// but narrating the basket as a whole (e.g. "mostly lean proteins, a bit
// sodium-heavy"). Same cosmetic-layer contract: never influences ranking,
// only narrates results already computed by optimiser.ts. See groq.ts for
// the underlying API call.

import { callGroq } from './groq.js'

export interface BasketSummaryInput {
  itemCount: number
  totalCost: number
  totalProteinG: number
  totalCalories: number
  totalFatG: number
  totalSaturatedFatG: number
  totalCarbsG: number
  totalSugarsG: number
  totalFiberG: number
  totalSodiumMg: number
  topItemNames: string[]
}

// Keyed on the aggregate stats that actually vary the summary text, not a
// hash of every item -- two runs with the same basket-level numbers would
// get an equivalent summary anyway.
const cache = new Map<string, string>()

function cacheKey(input: BasketSummaryInput) {
  return [
    input.itemCount,
    input.totalCost.toFixed(2),
    input.totalProteinG.toFixed(0),
    input.totalCalories.toFixed(0),
    input.totalSodiumMg.toFixed(0),
  ].join('|')
}

function buildPrompt(input: BasketSummaryInput) {
  return `You summarize a grocery basket for a protein-per-dollar budgeting app, to someone with no nutrition background. Be warm, plain-language, and brief.

Basket: ${input.itemCount} items, NZD $${input.totalCost.toFixed(2)} total
Protein: ${input.totalProteinG.toFixed(0)}g
Calories: ${input.totalCalories.toFixed(0)}kcal
Fat: ${input.totalFatG.toFixed(0)}g (of which saturated: ${input.totalSaturatedFatG.toFixed(0)}g)
Carbs: ${input.totalCarbsG.toFixed(0)}g (of which sugars: ${input.totalSugarsG.toFixed(0)}g)
Fiber: ${input.totalFiberG.toFixed(0)}g
Sodium: ${input.totalSodiumMg.toFixed(0)}mg
Some of the items: ${input.topItemNames.join(', ')}

All prices are in New Zealand dollars (NZD). In exactly 2-3 short sentences, describe what kind of basket this is overall (e.g. lean vs fatty, any standout high/low macro) and whether it looks like decent value for the protein it delivers. No jargon, no headings, no markdown -- plain text only. Note these are basket totals, not a per-day nutrition target -- don't imply this is meant to be eaten in one day.`
}

export async function summariseBasket(input: BasketSummaryInput): Promise<string> {
  const key = cacheKey(input)
  const cached = cache.get(key)
  if (cached) return cached

  const text = await callGroq(buildPrompt(input))
  cache.set(key, text)
  return text
}
