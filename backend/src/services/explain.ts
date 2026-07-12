// "Why this pick?" -- an on-demand, cosmetic explanation layer over the
// deterministic ranking in optimiser.ts. This never influences ranking or
// filtering; it only narrates a result that's already been computed, so a
// bad/unavailable LLM response degrades to "explanation unavailable," not a
// wrong grocery list. See groq.ts for the underlying API call.

import { callGroq } from './groq.js'

export interface ExplainableItem {
  name: string
  brand: string | null
  size: string | null
  store_name: string
  price_dollars: number
  protein_g: number
  kcal: number
  protein_per_dollar: number
  protein_pct_of_calories: number
  nutrition_source: 'openfoodfacts' | 'curated-reference' | null
}

// Keyed on the fields that actually affect the explanation text, not
// product_id alone -- prices/rankings shift day to day, and a stale cached
// explanation referencing yesterday's price would be misleading.
const cache = new Map<string, string>()

function cacheKey(item: ExplainableItem) {
  return [
    item.name,
    item.price_dollars,
    item.protein_g,
    item.kcal,
    item.nutrition_source,
  ].join('|')
}

function buildPrompt(item: ExplainableItem) {
  const nutritionCaveat =
    item.nutrition_source === 'curated-reference'
      ? 'Note: this nutrition data is an estimated category average (not a verified label for this exact product) -- mention that briefly.'
      : 'This nutrition data is from a verified product label.'

  return `You explain grocery picks for a protein-per-dollar budgeting app, to someone with no nutrition background. Be warm, plain-language, and brief.

Item: ${item.name}${item.brand ? ` (${item.brand})` : ''}${item.size ? `, ${item.size}` : ''}
Store: ${item.store_name}
Price: NZD $${item.price_dollars.toFixed(2)}
Protein: ${item.protein_g.toFixed(0)}g
Calories: ${item.kcal.toFixed(0)}kcal
Protein per dollar: ${item.protein_per_dollar.toFixed(1)}g of protein per NZD $1 spent
Share of calories from protein: ${(item.protein_pct_of_calories * 100).toFixed(0)}%
${nutritionCaveat}

All prices are in New Zealand dollars (NZD) -- say "NZD" or "$NZ" when mentioning price, don't just say "$" alone. In exactly 1-2 short sentences, explain why this is a good protein-per-dollar pick. No jargon, no headings, no markdown -- plain text only.`
}

export async function explainPick(item: ExplainableItem): Promise<string> {
  const key = cacheKey(item)
  const cached = cache.get(key)
  if (cached) return cached

  const text = await callGroq(buildPrompt(item))
  cache.set(key, text)
  return text
}
