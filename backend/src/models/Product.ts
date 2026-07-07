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
    source: { type: String, enum: ['openfoodfacts', null], default: null },
    off_product_name: String,
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
  },
})

export const Product = model('Product', productSchema, 'products')
