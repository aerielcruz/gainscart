import { Product } from '../models/Product.js'
import { Price } from '../models/Price.js'

// Minimum protein density and protein-to-calorie ratio a product must
// clear to be considered a "protein source" for ranking purposes.
// Without these, cheap starchy staples (flour, dry pasta) crowd out real
// protein foods just because they're cheap per gram and technically
// contain some protein -- e.g. flour is ~10g protein/100g but only ~11%
// of its calories come from that protein, versus ~48% for tinned
// sardines. Same "flag, don't silently assume" spirit as the
// effective_price_cent tier choice below -- these are reasoned defaults,
// not measured/validated, and worth revisiting for the research writeup.
const MIN_PROTEIN_PER_100G = 10 // grams protein per 100g of product
const MIN_PROTEIN_PCT_OF_CALORIES = 0.2 // share of total energy from protein
const KCAL_PER_KJ = 1 / 4.184
const KCAL_PER_GRAM_PROTEIN = 4

// Recognized dietaryPreferences values that map to an OFF allergens_tags
// exclusion (tag names with the "en:" prefix already stripped -- see
// offLookup.js). 'vegan'/'vegetarian' are handled separately since
// they're OFF's own computed ingredient-analysis status, not an allergen.
// IMPORTANT: this is informational filtering based on community-sourced
// OFF data, not a medical/allergy-safety guarantee -- it also does not
// account for "may contain traces of" cross-contamination warnings
// (OFF's separate traces_tags, not fetched). See LIMITATIONS.md.
const ALLERGEN_EXCLUSIONS: Record<string, string[]> = {
  'dairy-free': ['milk'],
  'gluten-free': ['gluten'],
  'nut-free': ['nuts', 'peanuts'],
  'egg-free': ['eggs'],
  'soy-free': ['soybeans'],
  'fish-free': ['fish'],
  'shellfish-free': ['crustaceans', 'molluscs'],
  'sesame-free': ['sesame-seeds'],
}

export const RECOGNIZED_DIETARY_PREFERENCES = ['vegan', 'vegetarian', ...Object.keys(ALLERGEN_EXCLUSIONS)]

function matchesDietaryPreferences(dietary: any, preferences: string[]) {
  const d = dietary ?? { vegan: null, vegetarian: null, allergens: [] }

  for (const pref of preferences) {
    if (pref === 'vegan' && d.vegan !== true) return false
    if (pref === 'vegetarian' && d.vegetarian !== true) return false

    const excludedAllergens = ALLERGEN_EXCLUSIONS[pref]
    if (excludedAllergens && excludedAllergens.some((a) => d.allergens.includes(a))) return false
  }

  return true
}

// Replaces legacy/4-rank-protein-per-dollar.js's DuckDB-based CLI ranking:
// this queries MongoDB directly, since DuckDB is now purely an ETL/sync
// tool and never touches the runtime request path.
export async function getOptimisedList(
  budget: number,
  dietaryPreferences: string[] = [],
  calorieBudget: number | null = null
) {
  // Reduced in plain JS rather than a MongoDB aggregation: the `prices`
  // collection is small enough to hold in memory (currently ~30 stores'
  // worth), and Atlas's free/shared tier rejects allowDiskUse outright,
  // so a $group over the full collection hits the 100MB in-memory limit
  // with no way to opt into disk spilling.
  const priceDocs = await Price.find(
    { effective_price_cent: { $ne: null } },
    { product_id: 1, store_id: 1, store_name: 1, vendor_name: 1, effective_price_cent: 1, observed_at: 1 }
  ).lean()

  // Latest observation per (product_id, store_id).
  const latestByProductStore = new Map<string, (typeof priceDocs)[number]>()
  for (const doc of priceDocs) {
    const key = `${doc.product_id}:${doc.store_id}`
    const existing = latestByProductStore.get(key)
    if (!existing || doc.observed_at > existing.observed_at) {
      latestByProductStore.set(key, doc)
    }
  }

  // Cheapest of those per product -- a shopper picks whichever store is
  // currently cheapest for that product.
  const cheapestByProduct = new Map<number, (typeof priceDocs)[number]>()
  for (const doc of latestByProductStore.values()) {
    const existing = cheapestByProduct.get(doc.product_id)
    if (!existing || doc.effective_price_cent < existing.effective_price_cent) {
      cheapestByProduct.set(doc.product_id, doc)
    }
  }

  const cheapestPerProduct = Array.from(cheapestByProduct.values())

  const productIds = cheapestPerProduct.map((p) => p.product_id)
  const products = await Product.find({
    product_id: { $in: productIds },
    // Fixed-weight products need size_grams; weighed products (fresh meat,
    // fish, etc.) have no fixed size but are priced per kg, so unit: 'kg'
    // is usable on its own -- see the 1000g reference-weight assumption
    // below. Pack-count items (e.g. "12pk" eggs) still can't be ranked:
    // there's no weight-per-unit to convert from.
    $or: [{ size_grams: { $ne: null } }, { unit: 'kg' }],
    'nutrition.matched': true,
    'nutrition.per_100g.protein_g': { $gte: MIN_PROTEIN_PER_100G },
  }).lean()

  const productsById = new Map(products.map((p) => [p.product_id, p]))

  const candidates = []
  for (const priceDoc of cheapestPerProduct) {
    const product = productsById.get(priceDoc.product_id)
    if (!product) continue

    if (!matchesDietaryPreferences(product.nutrition.dietary, dietaryPreferences)) continue

    // Defensive sanity check: macros can't physically exceed 100g per
    // 100g of product. Catches OFF data-entry errors and some wrong
    // barcode-format matches (seen in practice: 286g protein/100g on a
    // sardine tin). Doesn't catch every bad match -- e.g. a match to a
    // completely different but nutritionally-plausible product can still
    // slip through undetected. See CLAUDE.md-style note on OFF coverage:
    // documented limitation, not something this filter fully solves.
    const { protein_g: proteinG100, fat_g: fatG100, carbs_g: carbsG100 } = product.nutrition.per_100g
    if (proteinG100 > 100 || (fatG100 ?? 0) > 100 || (carbsG100 ?? 0) > 100) continue
    if (proteinG100 + (fatG100 ?? 0) + (carbsG100 ?? 0) > 100) continue

    const energyKj = product.nutrition.per_100g.energy_kj
    if (energyKj == null) continue // can't verify the calorie-ratio threshold without it

    const kcal100g = energyKj * KCAL_PER_KJ
    const proteinPctOfCalories = (product.nutrition.per_100g.protein_g * KCAL_PER_GRAM_PROTEIN) / kcal100g
    if (kcal100g <= 0 || proteinPctOfCalories < MIN_PROTEIN_PCT_OF_CALORIES) continue
    // Can't exceed 100% -- physically impossible, seen in practice from a
    // handful of OFF records with an implausibly low energy_kj relative to
    // their (otherwise plausible) protein_g, e.g. "2 kJ/100g" on roasted
    // pistachios (should be ~2600). The macro-sum sanity check above
    // doesn't catch this since it's an energy/protein mismatch, not an
    // impossible macro value on its own.
    if (proteinPctOfCalories > 1) continue

    // Weighed products (unit: 'kg', no fixed size_grams) are priced per
    // kilogram, so 1000g is the correct reference weight to pair with
    // that per-kg price -- not a guess, it follows directly from the
    // pricing unit itself.
    const referenceGrams = product.size_grams ?? (product.unit === 'kg' ? 1000 : null)
    if (referenceGrams == null) continue

    const priceDollars = priceDoc.effective_price_cent / 100
    const proteinG = (product.nutrition.per_100g.protein_g * referenceGrams) / 100
    const kcalTotal = (kcal100g * referenceGrams) / 100

    if (priceDollars <= 0 || proteinG <= 0) continue

    const proteinPerDollar = proteinG / priceDollars

    candidates.push({
      product_id: product.product_id,
      name: product.name,
      brand: product.brand,
      size: product.size ?? (product.unit === 'kg' ? 'per kg' : null),
      store_name: priceDoc.store_name,
      vendor_name: priceDoc.vendor_name,
      price_dollars: priceDollars,
      protein_g: proteinG,
      kcal: kcalTotal,
      protein_per_dollar: proteinPerDollar,
      protein_pct_of_calories: proteinPctOfCalories,
      // Combined ranking score: economics (protein_per_dollar) times
      // quality (protein_pct_of_calories), so a lean, high-protein food
      // outranks a cheaper but carb/fat-heavy one at a similar price, not
      // just whichever is cheapest per gram of protein. Multiplicative
      // rather than a weighted sum so neither factor can dominate on its
      // own -- a reasoned default, not empirically tuned.
      score: proteinPerDollar * proteinPctOfCalories,
      nutrition_per_100g: product.nutrition.per_100g,
      dietary: product.nutrition.dietary ?? { vegan: null, vegetarian: null, allergens: [] },
      // 'openfoodfacts' = verified barcode match; 'curated-reference' =
      // hand-curated category estimate for fresh/weighed foods OFF can't
      // barcode-match (see LIMITATIONS.md) -- a meaningfully weaker
      // evidence tier, surfaced here rather than blended silently.
      nutrition_source: product.nutrition.source,
      matched_category: product.nutrition.matched_category ?? null,
    })
  }

  candidates.sort((a, b) => b.score - a.score)

  // Greedy budget fill, not a true knapsack -- documented simplification
  // for this research prototype. Highest-score items (economics x quality)
  // are added first and skipped only if they don't fit the remaining
  // dollar budget or (if given) the remaining calorie budget. A whole
  // package/kg is taken as-is, not split, same as the dollar budget.
  const items = []
  let remainingBudget = budget
  let remainingCalorieBudget = calorieBudget
  let totalProteinG = 0
  let totalCalories = 0

  for (const item of candidates) {
    if (item.price_dollars > remainingBudget) continue
    if (remainingCalorieBudget != null && item.kcal > remainingCalorieBudget) continue

    items.push(item)
    remainingBudget -= item.price_dollars
    totalProteinG += item.protein_g
    totalCalories += item.kcal
    if (remainingCalorieBudget != null) remainingCalorieBudget -= item.kcal
  }

  return {
    budget,
    totalCost: budget - remainingBudget,
    remainingBudget,
    totalProteinG,
    calorieBudget,
    totalCalories,
    remainingCalorieBudget,
    dietaryPreferences,
    dietaryFiltersApplied: dietaryPreferences.length > 0,
    items,
  }
}
