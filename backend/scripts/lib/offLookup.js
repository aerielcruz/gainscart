// OFF asks apps to identify themselves.
const USER_AGENT = 'AIS-GainsCart-Research/1.0 (contact: aerielmatthew@gmail.com)'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Ported from legacy/3-fetch-off-nutrition.js -- tries the barcode as
// given, fully stripped of leading zeros, and padded to each standard
// GTIN length (8/12/13/14), since Grocer's raw barcode field doesn't
// consistently match the format OFF has the product stored under.
export function barcodeCandidates(barcode) {
  const core = barcode.replace(/^0+/, '') || '0'
  const candidates = new Set([barcode, core])
  for (const len of [8, 12, 13, 14]) {
    if (core.length <= len) candidates.add(core.padStart(len, '0'))
  }
  return Array.from(candidates)
}

// OFF's own ingredient-analysis output -- computed by OFF from the
// ingredients list, not something we're inferring ourselves. "unknown"/
// "maybe-*" tags map to null (genuinely unknown), not false, so callers
// can tell "confirmed not vegan" apart from "OFF has no ingredient list
// to analyze."
function veganStatus(tags) {
  if (tags.includes('en:vegan')) return true
  if (tags.includes('en:non-vegan')) return false
  return null
}

function vegetarianStatus(tags) {
  if (tags.includes('en:vegetarian')) return true
  if (tags.includes('en:non-vegetarian')) return false
  return null
}

async function fetchOnce(candidateBarcode) {
  const url = `https://world.openfoodfacts.org/api/v2/product/${candidateBarcode}.json?fields=code,product_name,nutriments,ingredients_analysis_tags,allergens_tags`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })

  if (!res.ok) return { found: false }

  const data = await res.json()
  if (data.status !== 1 || !data.product) return { found: false }

  const n = data.product.nutriments || {}
  const analysisTags = data.product.ingredients_analysis_tags || []
  const allergensTags = data.product.allergens_tags || []

  return {
    found: true,
    productName: data.product.product_name || null,
    per100g: {
      energy_kj: n['energy-kj_100g'] ?? n['energy_100g'] ?? null,
      protein_g: n['proteins_100g'] ?? null,
      fat_g: n['fat_100g'] ?? null,
      saturated_fat_g: n['saturated-fat_100g'] ?? null,
      carbs_g: n['carbohydrates_100g'] ?? null,
      sugars_g: n['sugars_100g'] ?? null,
      fiber_g: n['fiber_100g'] ?? null,
      // OFF reports sodium in g/100g; CLAUDE.md schema wants mg.
      sodium_mg: n['sodium_100g'] != null ? n['sodium_100g'] * 1000 : null,
    },
    dietary: {
      vegan: veganStatus(analysisTags),
      vegetarian: vegetarianStatus(analysisTags),
      // e.g. "en:milk" -> "milk". Declared allergens only -- does not
      // include "may contain traces of" cross-contamination warnings
      // (OFF's separate traces_tags), see LIMITATIONS.md.
      allergens: allergensTags.map((t) => t.replace(/^en:/, '')),
    },
  }
}

export async function lookupNutritionByBarcode(barcode) {
  for (const candidate of barcodeCandidates(barcode)) {
    const outcome = await fetchOnce(candidate)
    if (outcome.found) return outcome
    await sleep(50) // short pause between format attempts for the same barcode
  }
  return { found: false }
}
