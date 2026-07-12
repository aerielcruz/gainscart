import { Schema, model } from 'mongoose'

// Mirrors the `products` collection described in CLAUDE.md.
const productSchema = new Schema({
  product_id: { type: Number, required: true, unique: true },
  name: String,
  brand: String,
  unit: String,
  size: String,
  size_grams: Number,
  barcode: String,
  nutrition: {
    // 'curated-reference' = hand-curated per-100g estimate for fresh/weighed
    // foods (chicken breast, beef mince, etc.), matched by product-name
    // keyword rather than barcode -- see freshFoodReference.js. Kept
    // distinct from 'openfoodfacts' since it's a weaker evidence tier
    // (category-level estimate, not a product-specific lookup).
    source: { type: String, enum: ['openfoodfacts', 'curated-reference', null], default: null },
    off_product_name: String,
    // Community-uploaded product photo from OFF -- only ever set when
    // source is 'openfoodfacts' (curated-reference fresh foods have no
    // barcode to fetch a photo for). Coverage is independent of nutrition
    // match rate -- a matched product can still have no photo.
    image_url: String,
    // Which curated category matched (e.g. 'chicken_breast') -- only set
    // when source is 'curated-reference'. QA field, same purpose as
    // off_product_name above.
    matched_category: String,
    per_100g: {
      energy_kj: Number,
      protein_g: Number,
      fat_g: Number,
      saturated_fat_g: Number,
      carbs_g: Number,
      sugars_g: Number,
      fiber_g: Number,
      sodium_mg: Number,
    },
    matched: { type: Boolean, default: false },
    synced_at: Date,
    // From OFF's ingredients_analysis_tags / allergens_tags -- not
    // requested in the original nutrition sync, backfilled separately.
    // vegan/vegetarian are true/false/null (null = OFF has no ingredient
    // list to analyze, i.e. genuinely unknown, not "no").
    dietary: {
      vegan: { type: Boolean, default: null },
      vegetarian: { type: Boolean, default: null },
      allergens: { type: [String], default: [] },
    },
  },
})

export const Product = model('Product', productSchema, 'products')
