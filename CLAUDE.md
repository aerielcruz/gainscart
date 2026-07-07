# GainsCart

Protein-per-dollar grocery optimiser for NZ supermarkets. Given a budget and
dietary preferences, returns an optimised grocery list showing protein, other
macros/micros, and cost breakdown per item and in total.

This is also the backing artifact for an AIS (Auckland Institute of Studies)
Design Science Research (DSR) applied research project, so correctness,
reproducibility, and documented limitations matter as much as UX polish.

## Tech Stack

**Frontend**
- React + TypeScript + Tailwind CSS
- `tsconfig.json`: NOT strict mode. `any` is allowed. Don't fight me on this
  during scaffolding -- speed of iteration matters more than type rigor here.
- Design: dark theme. Black (`#000000` or near-black `#0a0a0a`) background,
  white text, blue accent color for interactive elements (buttons, links,
  active states, highlights). Keep it clean and high-contrast, gym/fitness
  app aesthetic, not corporate-SaaS pastel.

**Backend**
- Node.js + Express
- MongoDB (Atlas or local, connection via `.env` -> `MONGODB_URI`)
- Data pipeline scripts (schema sync, price fetching) are plain Node scripts,
  not part of the Express app itself -- they run on a schedule (see Data
  Pipeline section) and write into MongoDB, which the Express API then reads.

## Data Sources

All data comes from Grocer.nz's open datasets (no auth required, but no SLA
either -- Roc from Grocer confirmed these are provided as-is, can change
without notice, and are NZ-only, no AU supermarkets):

- **Base catalog**: `https://assets-prod.grocer.nz/public/base_v3.duckdb.br`
  - A DuckDB file (NOTE: despite the `.br` extension, Node's built-in
    `fetch()` may auto-decompress this via the `Content-Encoding` header --
    always check for the `DUCK` magic bytes before assuming you need to run
    Brotli decompression yourself)
  - Contains tables: `public_products` (id, name, brand, unit, size,
    redirected_to), `public_barcodes` (barcode, product_id),
    `public_stores` (id, vendor_id, name, is_enabled), `public_vendors`
    (id, name), `public_collections` / `public_collection_hierarchy` /
    `public_collection_members` (category taxonomy), `public_prices` and
    `public_price_history` (both empty in this file -- real data lives in
    the parquet files below, matched by the same schema)
  - Updates daily ~6:30am NZ time
- **Live prices per store**: `https://assets-prod.grocer.nz/public/prices_per_store_v3/public_prices_<GROCER_STORE_ID>.parquet`
  - No zero-padding on store_id. Columns: updated_at, store_id, product_id,
    original_price_cent, sale_price_cent, club_price_cent, online_price_cent,
    multibuy_price_cent, multibuy_quantity, club_multibuy_price_cent,
    club_multibuy_quantity
  - Query these remotely via DuckDB's `httpfs` extension
    (`read_parquet(url)`) -- no need to download the whole file
  - Updates daily ~6:30am NZ time
- **Price history per product**: `https://assets-prod.grocer.nz/public/price_history_v3/price_history_<GROCER_PRODUCT_ID>.parquet`
  - No zero-padding on product_id. Same price columns as above, one row per
    (store_id, product_id, timestamp) over time.
  - Updates weekly, Tuesdays ~3am NZ time
- **Nutrition data**: NOT included in the Grocer dataset at all --
  `public_products` has no protein/calorie/micronutrient fields. Sourced
  separately from Open Food Facts (OFF) via barcode lookup
  (`https://world.openfoodfacts.org/api/v2/product/<barcode>.json`).
  Coverage is incomplete (expect well under 100% match rate -- OFF is
  crowd-sourced and under-covers NZ home-brand/private-label products).
  Document match-rate as a stated limitation, not a bug to eliminate.

## MongoDB Schema

Two main collections, joined on `product_id` (NOT barcode -- barcode is a
secondary lookup key used only for the OFF nutrition join, since not all
products have one, e.g. pack-count items and some fresh produce):

**`products`** (one doc per product, relatively static, refreshed daily)
```
{
  product_id: Number,       // Grocer's internal id, primary key
  name: String,
  brand: String,
  unit: String,
  size: String,             // raw size string e.g. "125g", "36pk"
  size_grams: Number|null,  // parsed weight in grams, null if unparseable
  barcode: String|null,
  nutrition: {
    source: "openfoodfacts" | null,
    off_product_name: String|null,   // for manual QA of match quality
    per_100g: {
      energy_kj: Number|null,
      protein_g: Number|null,
      fat_g: Number|null,
      saturated_fat_g: Number|null,
      carbs_g: Number|null,
      sugars_g: Number|null,
      fiber_g: Number|null,
      sodium_mg: Number|null
      // add more micros here as needed -- OFF field coverage varies a lot
      // per product, expect most micros to be null for most products
    },
    matched: Boolean,        // false if OFF lookup was attempted but missed
    synced_at: Date
  }
}
```

**`prices`** (time-series: one doc per product+store+observation)
```
{
  product_id: Number,
  store_id: Number,
  store_name: String,        // denormalized for query convenience
  vendor_name: String,       // "Woolworths" | "New World" | "Pak'nSave"
  original_price_cent: Number|null,
  sale_price_cent: Number|null,
  club_price_cent: Number|null,
  online_price_cent: Number|null,
  effective_price_cent: Number|null,  // COALESCE(sale, original) -- decide
                                        // and document your pricing-tier
                                        // assumption here, see note below
  observed_at: Date
}
```

Index `prices` on `{ product_id: 1, store_id: 1, observed_at: -1 }` for
fast "latest price" lookups, and consider a TTL or archival strategy once
history grows -- daily updates across many stores accumulate fast.

**Open decision, flag don't silently assume:** which price tier counts as
"the" price a shopper pays (sale vs original vs club-card vs online) matters
for the optimiser's output and should be a documented, deliberate choice in
the research write-up, not a buried implementation detail.

## Data Pipeline

Separate from the Express app. Plain Node scripts, run on a schedule
(matching Grocer's own update cadence):
1. Daily (~post 6:30am NZ): re-sync `base_v3.duckdb.br` -> upsert `products`
   collection with any catalog changes.
2. Daily: for each tracked store, query that store's price parquet via
   `httpfs` -> insert new `prices` documents.
3. Ongoing/incremental: OFF nutrition lookups for any product without
   nutrition data yet, respecting OFF's rate limits (small delay between
   requests, identify the app via a proper User-Agent header).

## Code Style
- Prefer plain, readable code over clever abstractions -- this needs to be
  explainable in a research report.
- Comment WHY for any non-obvious data assumption (price tier chosen, size
  parsing regex, nutrition match logic), not just WHAT the code does.
- No premature optimization -- correctness and clarity first, this is a
  research prototype, not a production system serving real traffic yet.