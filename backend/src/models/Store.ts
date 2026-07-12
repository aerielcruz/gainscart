import { Schema, model } from 'mongoose'

// Mirrors the `stores` collection populated by sync-products.js -- not
// part of the schema documented in CLAUDE.md, added so sync-prices.js (and
// now optimiser.ts) can look up store metadata without hardcoding it.
const storeSchema = new Schema({
  store_id: { type: Number, required: true, unique: true },
  vendor_id: Number,
  vendor_name: String,
  name: String,
  is_enabled: Boolean,
})

export const Store = model('Store', storeSchema, 'stores')
