import { Schema, model } from 'mongoose'

// Mirrors the `prices` collection described in CLAUDE.md.
const priceSchema = new Schema({
  product_id: { type: Number, required: true },
  store_id: { type: Number, required: true },
  store_name: String,
  vendor_name: String,
  original_price_cent: Number,
  sale_price_cent: Number,
  club_price_cent: Number,
  online_price_cent: Number,
  effective_price_cent: Number,
  observed_at: { type: Date, required: true },
})

priceSchema.index({ product_id: 1, store_id: 1, observed_at: -1 })

export const Price = model('Price', priceSchema, 'prices')
