import { Product } from '../models/Product.js'
import { Price } from '../models/Price.js'
import { Store } from '../models/Store.js'

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

// 'value' (default): rank by protein_per_dollar x protein_pct_of_calories,
// same combined economics-x-quality score as always. 'protein_density':
// rank by protein_pct_of_calories alone, for someone who cares more about
// getting a lean, high-protein food than about squeezing the most protein
// out of each dollar -- price still gates what fits the budget during the
// greedy fill below, it just no longer influences *which* items are
// preferred first. Addresses the "no macro-preference ranking mode yet"
// gap noted in LIMITATIONS.md.
export const RANK_MODES = ['value', 'protein_density'] as const
export type RankMode = (typeof RANK_MODES)[number]

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

type PriceDoc = {
  product_id: number
  store_id: number
  store_name: string
  vendor_name: string
  effective_price_cent: number
  observed_at: Date
}

// Deliberately narrower than PriceDoc -- no store_name/vendor_name strings,
// since those get duplicated across every one of the ~438K map entries
// below otherwise. Store names are looked up afterward from the `stores`
// collection (~30 docs) for only the handful of cheapest-per-product
// winners, not for every candidate considered along the way.
type MinimalPriceDoc = {
  product_id: number
  store_id: number
  effective_price_cent: number
  observed_at: Date
}

// This fetch-and-reduce is the single most expensive step in the request
// path -- measured at ~25s (438K raw price docs transferred from Atlas to
// Node; the query itself runs in <1s server-side, so it's driver/BSON
// overhead per document, not query planning). A real aggregation would
// avoid transferring raw docs at all, but every attempt (a $sort matching
// the existing index, and a $group using $top/$bottom to avoid sorting
// entirely) still exceeded Atlas M0's 100MB $group/32MB $sort in-memory
// limits with allowDiskUse rejected outright -- same wall the original
// comment here already documented for a plain $group.
//
// The result doesn't depend on budget/dietaryPreferences/calorieBudget at
// all, and the source data only changes ~once/day (see CLAUDE.md's data
// pipeline schedule), so caching it in memory is safe, not just fast --
// stale-by-an-hour is a non-issue against a dataset that's stale-by-a-day
// by design. This turns every request after the first (per cache window)
// from ~25s into effectively instant.
//
// IMPORTANT: index.ts calls warmCheapestPerProductCache() before the server
// starts accepting requests, and re-warms it in the background on a timer --
// a live HTTP request should never be the one paying this cost. Found in
// practice on Render: the cold path took long enough (>~55s from Render's
// network path to Atlas, vs ~25s measured locally) to exceed the platform's
// own gateway timeout, turning a slow-but-working request into a hard 502.
export const CHEAPEST_PER_PRODUCT_CACHE_TTL_MS = 60 * 60 * 1000
let cheapestPerProductCache: { data: PriceDoc[]; expiresAt: number } | null = null

async function getCheapestPerProduct(): Promise<PriceDoc[]> {
  if (cheapestPerProductCache && cheapestPerProductCache.expiresAt > Date.now()) {
    return cheapestPerProductCache.data
  }

  // Streamed grouped-by-product, not into a full (product_id, store_id) map
  // -- an earlier version held one entry per unique pair (438,855 of them
  // right now, since only one sync run has happened so far so nothing
  // dedupes yet) and crashed the deployed Render instance with an
  // out-of-memory error (Render's free tier caps container RAM well below
  // what this held, even after dropping string fields -- see git history).
  //
  // Fix: sort matches the existing {product_id,store_id,observed_at} index
  // exactly (confirmed via .explain() -- IXSCAN, no blocking in-memory SORT
  // stage), so docs stream in with every (product_id, store_id) group's
  // latest-first order guaranteed by the index itself. That means only one
  // product's rows (bounded by ~30 stores) ever need to be held at once,
  // converging to a ~32,708-entry result (the actual distinct product
  // count) instead of the full 438,855-pair cross product -- measured
  // ~117MB peak RSS this way vs. ~450-460MB before, comfortably inside
  // Render's limit. The explicit small batchSize turned out to matter as
  // much as the algorithm change: the driver's default cursor batching held
  // enough in flight to still crash a tightly memory-constrained process
  // even with this grouped approach, until reduced.
  const cursor = Price.find(
    { effective_price_cent: { $ne: null } },
    { product_id: 1, store_id: 1, effective_price_cent: 1, observed_at: 1 }
  )
    .sort({ product_id: 1, store_id: 1, observed_at: -1 })
    .batchSize(500)
    .lean<MinimalPriceDoc>()
    .cursor()

  const cheapestPerProduct: MinimalPriceDoc[] = []
  let currentProductId: number | null = null
  let seenStoresForProduct = new Set<number>()
  let cheapestForProduct: MinimalPriceDoc | null = null

  function finalizeCurrentProduct() {
    if (cheapestForProduct) cheapestPerProduct.push(cheapestForProduct)
  }

  for await (const doc of cursor) {
    if (doc.product_id !== currentProductId) {
      finalizeCurrentProduct()
      currentProductId = doc.product_id
      seenStoresForProduct = new Set()
      cheapestForProduct = null
    }

    // Within a product's group, docs for a given store are ordered latest
    // (observed_at desc) first -- the first time we see a store_id here is
    // its latest observation, so later repeats of the same store_id within
    // this group are older and should be ignored.
    if (seenStoresForProduct.has(doc.store_id)) continue
    seenStoresForProduct.add(doc.store_id)

    if (!cheapestForProduct || doc.effective_price_cent < cheapestForProduct.effective_price_cent) {
      cheapestForProduct = doc
    }
  }
  finalizeCurrentProduct()

  // Store names are only ever needed for the winners (one per product),
  // not for every candidate considered above -- looked up now from the
  // small `stores` collection (~30 docs) rather than carried through the
  // large intermediate maps.
  const stores = await Store.find({}, { store_id: 1, name: 1, vendor_name: 1 }).lean()
  const storeById = new Map(stores.map((s) => [s.store_id, s]))

  const data: PriceDoc[] = cheapestPerProduct.map((doc) => {
    const store = storeById.get(doc.store_id)
    return {
      product_id: doc.product_id,
      store_id: doc.store_id,
      effective_price_cent: doc.effective_price_cent,
      observed_at: doc.observed_at,
      store_name: store?.name ?? 'Unknown store',
      vendor_name: store?.vendor_name ?? 'Unknown',
    }
  })

  cheapestPerProductCache = { data, expiresAt: Date.now() + CHEAPEST_PER_PRODUCT_CACHE_TTL_MS }
  return data
}

// Called from index.ts at startup (before the server accepts requests) and
// on a recurring timer -- see the cache comment above for why a live
// request must never be the one paying this cost.
export async function warmCheapestPerProductCache(): Promise<void> {
  await getCheapestPerProduct()
}

// Replaces legacy/4-rank-protein-per-dollar.js's DuckDB-based CLI ranking:
// this queries MongoDB directly, since DuckDB is now purely an ETL/sync
// tool and never touches the runtime request path.
export async function getOptimisedList(
  budget: number,
  dietaryPreferences: string[] = [],
  calorieBudget: number | null = null,
  rankBy: RankMode = 'value'
) {
  const cheapestPerProduct = await getCheapestPerProduct()

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

    // Scaled from per-100g to this item's actual reference weight, same
    // as protein_g/kcal above -- null propagates rather than becoming 0,
    // since most micros are null for most products (see CLAUDE.md) and a
    // silent 0 would be indistinguishable from "genuinely none."
    const scaleFrom100g = (per100g: number | null | undefined) =>
      per100g == null ? null : (per100g * referenceGrams) / 100

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
      // 'value': economics (protein_per_dollar) times quality
      // (protein_pct_of_calories), so a lean, high-protein food outranks a
      // cheaper but carb/fat-heavy one at a similar price, not just
      // whichever is cheapest per gram of protein. Multiplicative rather
      // than a weighted sum so neither factor can dominate alone -- a
      // reasoned default, not empirically tuned.
      // 'protein_density': quality alone, for ranking by leanness rather
      // than value -- see RankMode above.
      score: rankBy === 'protein_density' ? proteinPctOfCalories : proteinPerDollar * proteinPctOfCalories,
      nutrition_per_100g: product.nutrition.per_100g,
      dietary: product.nutrition.dietary ?? { vegan: null, vegetarian: null, allergens: [] },
      // 'openfoodfacts' = verified barcode match; 'curated-reference' =
      // hand-curated category estimate for fresh/weighed foods OFF can't
      // barcode-match (see LIMITATIONS.md) -- a meaningfully weaker
      // evidence tier, surfaced here rather than blended silently.
      nutrition_source: product.nutrition.source,
      matched_category: product.nutrition.matched_category ?? null,
      // Only ever set for openfoodfacts matches -- curated-reference fresh
      // foods have no barcode to fetch a photo for. Not guaranteed even
      // then, since OFF's photo coverage is separate from its data
      // coverage (see offLookup.js).
      image_url: product.nutrition.image_url ?? null,
      fat_g: scaleFrom100g(product.nutrition.per_100g.fat_g),
      saturated_fat_g: scaleFrom100g(product.nutrition.per_100g.saturated_fat_g),
      carbs_g: scaleFrom100g(product.nutrition.per_100g.carbs_g),
      sugars_g: scaleFrom100g(product.nutrition.per_100g.sugars_g),
      fiber_g: scaleFrom100g(product.nutrition.per_100g.fiber_g),
      sodium_mg: scaleFrom100g(product.nutrition.per_100g.sodium_mg),
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
  // Nulls (missing OFF field, most micros for most products -- see
  // CLAUDE.md) are skipped rather than treated as 0, so a total only
  // reflects items that actually reported that micro, and isn't silently
  // deflated by items with no data for it.
  let totalFatG = 0
  let totalSaturatedFatG = 0
  let totalCarbsG = 0
  let totalSugarsG = 0
  let totalFiberG = 0
  let totalSodiumMg = 0

  for (const item of candidates) {
    if (item.price_dollars > remainingBudget) continue
    if (remainingCalorieBudget != null && item.kcal > remainingCalorieBudget) continue

    items.push(item)
    remainingBudget -= item.price_dollars
    totalProteinG += item.protein_g
    totalCalories += item.kcal
    if (item.fat_g != null) totalFatG += item.fat_g
    if (item.saturated_fat_g != null) totalSaturatedFatG += item.saturated_fat_g
    if (item.carbs_g != null) totalCarbsG += item.carbs_g
    if (item.sugars_g != null) totalSugarsG += item.sugars_g
    if (item.fiber_g != null) totalFiberG += item.fiber_g
    if (item.sodium_mg != null) totalSodiumMg += item.sodium_mg
    if (remainingCalorieBudget != null) remainingCalorieBudget -= item.kcal
  }

  return {
    budget,
    totalCost: budget - remainingBudget,
    remainingBudget,
    totalProteinG,
    totalFatG,
    totalSaturatedFatG,
    totalCarbsG,
    totalSugarsG,
    totalFiberG,
    totalSodiumMg,
    calorieBudget,
    totalCalories,
    remainingCalorieBudget,
    dietaryPreferences,
    dietaryFiltersApplied: dietaryPreferences.length > 0,
    rankBy,
    items,
  }
}
