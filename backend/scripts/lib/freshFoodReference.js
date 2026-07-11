/**
 * freshFoodReference.js
 *
 * Hand-curated per-100g nutrition for fresh/weighed foods (chicken, beef,
 * lamb, fish, etc.) -- the "real fix, not yet built" flagged in
 * LIMITATIONS.md. These products are sold with store-generated scale-label
 * barcodes that Open Food Facts has no way to recognize (0% OFF match rate
 * across all 15,258 unit:'kg' products, confirmed before this was written),
 * so they're matched by product-name keyword instead.
 *
 * Values are generic raw/as-sold composition figures for each category
 * (in the spirit of USDA FoodData Central reference values, not brand- or
 * NZ-specific lab results) -- a category-level estimate, not a
 * product-specific lookup. Documented as a distinct, weaker evidence tier
 * via nutrition.source: 'curated-reference' (see Product.ts), never
 * overwrites a genuine OFF product match.
 *
 * Matching is keyword-based against product name only, checked in priority
 * order (first match wins) so more specific categories (e.g. "chicken
 * mince") are tried before broad fallbacks (e.g. "chicken"). A product is
 * skipped entirely (no category, no guess) if it hits GLOBAL_EXCLUDE_TERMS
 * -- these were identified by pulling real product names for each category
 * from the live catalog and checking for false positives: pet food/treats,
 * mayo-based deli salads, pastry pies, organ meats (different nutrition
 * profile from muscle meat), bread rolls that happen to contain a meat
 * word (e.g. "Swiss Roll Beef", "Cheese And Ham Roll"), and
 * breaded/crumbed items (different macro profile from the raw cut).
 */

// Never assign a category if any of these appear in the name -- checked
// before category matching, regardless of what else the name contains.
const GLOBAL_EXCLUDE_TERMS = [
  'pet', // pet food/mince/treats -- not human food
  'dog food',
  'cat food',
  'salad', // mayo/dressing-based deli salads, not the raw ingredient
  'schnitzel',
  'crumbed', // breaded -- different carb/fat profile than the raw cut
  'luncheon', // processed lunch meat, not a fresh cut
  'pie', // catches sweet pies AND savoury pastry pies (e.g. "Steak Family Pie")
  'pastry',
  'bones', // mostly bone/connective tissue, not comparable to muscle meat
  'liver', // organ meat -- distinct nutrition profile, no category built for it
  'kidney',
  'heart',
  'tripe',
  'tongue',
  'offal',
  'oxtail',
  'ox tail',
  'meatball', // composite/processed -- fillers change the macro profile
  'burger',
  'nugget',
  'kebab',
  'sausage roll',
  'roll', // bread rolls that happen to contain a meat word, e.g. "Swiss Roll Beef"
  'terrine',
  'pate',
  'pâté',
  'frame', // bony carcass frames (chicken/salmon) sold for stock -- low meat yield
  'giblet',
  'crackle', // pork skin/fat, not muscle meat
  'quiche',
  'sandwich', // prepared filled sandwiches -- loses the rare literal "sandwich steak" cut name, a safer false-negative than including 10 composite sandwiches as raw meat
  'pizza',
  'pasta',
  'fettucine',
  'fettuccine',
  'lasagne',
  'muffin',
  'bun',
  'twist',
  'knot',
  'loaf',
  'wrap',
  'meatloaf',
  'dumpling',
  'sushi',
  'scone',
  'hashbrown',
  'ready meal',
  'hock', // bone/connective-tissue-heavy cut (boiling/smoking), not comparable to the lean-cut reference values
  'ball', // meatballs ("meat ball(s)"/"meatballs") -- composite/processed
  'burg', // catches "burger" and abbreviated "burg" (e.g. "Mini Burg")
  'dog', // dog treats/bones not already caught by 'pet' (e.g. "Lamb Knuckle Dog Treats")
  'aioli',
  'bake',
  'and egg', // bare "Bacon And Egg" etc. -- a prepared combo, not raw bacon
  'head', // fish/pig heads -- mostly bone/cartilage/skin, not comparable to fillet/muscle meat
  'crack', // catches "crackle"/"crackling"/"cracking" (pork skin/fat) and "cracked pepper" (a sausage flavour, small acceptable false-negative loss)
  'tendon', // connective tissue (collagen) -- technically high crude protein but a different, lower-quality protein than muscle meat
  'gizzard', // organ meat, same tier as the liver/kidney/heart/tripe/tongue exclusions above
  'chicken neck', // bony, minimal meat yield -- unlike "lamb/venison neck chops" (a genuine meaty cut), left specific so those aren't excluded too
]

// energy_kj/kcal derived at 4 kcal/g protein+carbs, 9 kcal/g fat (standard
// Atwater factors), consistent with how the optimiser converts energy_kj
// back to kcal elsewhere (KCAL_PER_KJ in optimiser.ts).
function per100g({ protein_g, fat_g, carbs_g, saturated_fat_g = null, sugars_g = null, fiber_g = null, sodium_mg = null }) {
  const kcal = protein_g * 4 + fat_g * 9 + carbs_g * 4
  return {
    energy_kj: Math.round(kcal * 4.184),
    protein_g,
    fat_g,
    saturated_fat_g,
    carbs_g,
    sugars_g,
    fiber_g,
    sodium_mg,
  }
}

// Order matters: listed most-specific-first so e.g. "Beef Sausages" hits
// the `sausages` rule (checked before the `beef` fallback) and "NZ Beef
// Mince" hits `beef_mince` (checked before `beef`).
const CATEGORIES = [
  {
    id: 'chicken_breast',
    label: 'Chicken breast (skinless)',
    include: ['chicken breast'],
    nutrition: per100g({ protein_g: 22.5, fat_g: 2.6, carbs_g: 0 }),
  },
  {
    id: 'chicken_thigh',
    label: 'Chicken thigh',
    include: ['chicken thigh'],
    nutrition: per100g({ protein_g: 20, fat_g: 5.7, carbs_g: 0 }),
  },
  {
    id: 'chicken_mince',
    label: 'Chicken mince',
    include: ['chicken mince'],
    nutrition: per100g({ protein_g: 18, fat_g: 8, carbs_g: 0 }),
  },
  {
    id: 'beef_mince',
    label: 'Beef mince',
    include: ['beef mince'],
    nutrition: per100g({ protein_g: 19, fat_g: 15, carbs_g: 0 }),
  },
  {
    id: 'sausages',
    label: 'Sausages (generic, any meat)',
    // Broad on purpose -- checked before beef/lamb/pork/venison so
    // "Beef Sausages" etc. route here, not to the raw-cut categories.
    // Sausages include breadcrumb/rusk filler (some carbs) and are
    // fattier than the whole-muscle cuts below.
    include: ['sausage'],
    nutrition: per100g({ protein_g: 12, fat_g: 20, carbs_g: 5 }),
  },
  {
    id: 'bacon',
    label: 'Bacon',
    include: ['bacon'],
    nutrition: per100g({ protein_g: 11, fat_g: 40, carbs_g: 0.5, sodium_mg: 1500 }),
  },
  {
    id: 'salmon',
    label: 'Salmon',
    include: ['salmon'],
    nutrition: per100g({ protein_g: 20, fat_g: 13, carbs_g: 0 }),
  },
  {
    id: 'tuna',
    label: 'Tuna',
    include: ['tuna'],
    nutrition: per100g({ protein_g: 24, fat_g: 0.5, carbs_g: 0 }),
  },
  {
    id: 'whitefish',
    label: 'White fish fillets (generic lean fish)',
    include: ['fish fillet', 'kingfish', 'hoki', 'snapper', 'tarakihi', 'gurnard', 'trevally', 'moki', 'warehou', 'basa', 'kahawai', 'elephant fish'],
    exclude: ['chocolate fish'], // confectionery, not seafood
    nutrition: per100g({ protein_g: 18, fat_g: 1, carbs_g: 0 }),
  },
  {
    id: 'venison',
    label: 'Venison',
    include: ['venison'],
    nutrition: per100g({ protein_g: 22, fat_g: 2.4, carbs_g: 0 }),
  },
  {
    id: 'lamb',
    label: 'Lamb',
    include: ['lamb'],
    nutrition: per100g({ protein_g: 20, fat_g: 8, carbs_g: 0 }),
  },
  {
    id: 'pork',
    label: 'Pork',
    include: ['pork'],
    nutrition: per100g({ protein_g: 21, fat_g: 6, carbs_g: 0 }),
  },
  {
    id: 'beef',
    label: 'Beef (steak/roast cuts)',
    include: ['beef'],
    nutrition: per100g({ protein_g: 22, fat_g: 6, carbs_g: 0 }),
  },
  {
    id: 'chicken',
    label: 'Chicken (other cuts, fallback)',
    // Broad fallback -- only reached if breast/thigh/mince didn't match.
    // Uses thigh-ish values since most unspecified-cut chicken in the
    // catalog (nibbles, tenderloin, mignon) includes some dark meat/skin.
    include: ['chicken'],
    nutrition: per100g({ protein_g: 19, fat_g: 8, carbs_g: 0 }),
  },
]

function nameHasTerm(name, term) {
  return name.toLowerCase().includes(term.toLowerCase())
}

/**
 * Returns the matched category ({ id, label, nutrition }) for a product
 * name, or null if it should be skipped (global exclude hit, or no
 * category's include terms matched).
 */
export function matchFreshFoodCategory(name) {
  if (!name) return null

  if (GLOBAL_EXCLUDE_TERMS.some((term) => nameHasTerm(name, term))) return null

  for (const category of CATEGORIES) {
    if (category.exclude?.some((term) => nameHasTerm(name, term))) continue
    if (category.include.some((term) => nameHasTerm(name, term))) {
      return { id: category.id, label: category.label, nutrition: category.nutrition }
    }
  }

  return null
}

export { CATEGORIES, GLOBAL_EXCLUDE_TERMS }
