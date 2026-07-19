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
  - No zero-padding on product_id. **Actual schema is just `(updated_at,
    store_id, price_cent)`** -- confirmed via `DESCRIBE` against a real
    file. This contradicts the "same price columns as" note that used to
    be here: there is no original/sale/club/online split in price
    history, only one price column, so there's no price-tier choice to
    make when reading it (see `backend/src/services/priceTrend.ts`).
  - Updates weekly, Tuesdays ~3am NZ time
- **Nutrition data**: NOT included in the Grocer dataset at all --
  `public_products` has no protein/calorie/micronutrient fields. Sourced
  separately from Open Food Facts (OFF) via barcode lookup
  (`https://world.openfoodfacts.org/api/v2/product/<barcode>.json`).
  Coverage is incomplete (expect well under 100% match rate -- OFF is
  crowd-sourced and under-covers NZ home-brand/private-label products).
  Document match-rate as a stated limitation, not a bug to eliminate.

## MongoDB Schema

Four collections. `products`/`prices` join on `product_id` (NOT barcode --
barcode is a secondary lookup key used only for the OFF nutrition join,
since not all products have one, e.g. pack-count items and some fresh
produce):

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
    // 'curated-reference' = hand-curated per-100g estimate for
    // fresh/weighed foods OFF can't barcode-match (see
    // scripts/lib/freshFoodReference.js) -- a weaker evidence tier than a
    // real per-product OFF match, surfaced to the frontend rather than
    // blended in silently.
    source: "openfoodfacts" | "curated-reference" | null,
    off_product_name: String|null,   // for manual QA of match quality
    matched_category: String|null,   // which curated category matched, e.g. 'chicken_breast'
    // Community-uploaded photo from OFF -- only ever set for
    // openfoodfacts matches, and not guaranteed even then (photo
    // coverage is a separate crowd-sourcing effort from data coverage).
    image_url: String|null,
    // Fallback illustration generated via Pollinations.ai (free, keyless)
    // by scripts/backfill-ai-images.js when image_url is null, for
    // products eligible to appear in results at all -- see LIMITATIONS.md
    // and the "AI Features" section below. Always shown labeled "AI" in
    // the UI, never presented as a real photo.
    ai_image_url: String|null,
    ai_image_generated_at: Date|null,
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
    synced_at: Date,
    // From OFF's ingredients_analysis_tags/allergens_tags. vegan/
    // vegetarian are true/false/null -- null means OFF has no ingredient
    // list to analyze (genuinely unknown), not "no".
    dietary: {
      vegan: Boolean|null,
      vegetarian: Boolean|null,
      allergens: [String]
    }
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
  effective_price_cent: Number|null,  // see resolved price-tier decision below
  observed_at: Date
}
```

Index `prices` on `{ product_id: 1, store_id: 1, observed_at: -1 }` for
fast "latest price" lookups, and consider a TTL or archival strategy once
history grows -- daily updates across many stores accumulate fast.

**Price-tier decision (resolved):** `effective_price_cent = COALESCE(
sale_price_cent, original_price_cent)`. Club-card and online prices are
deliberately ignored -- not every shopper has a club card -- see
`scripts/sync-prices.js`'s `PRICE-TIER ASSUMPTION` comment. Documented here
as a deliberate research-design choice, not a buried implementation detail;
revisit if the write-up calls for a different tier.

**`stores`** (one doc per store, refreshed daily alongside `products` --
not in Grocer's own documented schema, added so the pipeline/API can look
up store metadata without hardcoding it)
```
{
  store_id: Number,
  vendor_id: Number,
  vendor_name: String,
  name: String,
  is_enabled: Boolean
}
```

**`survey_responses`** (one doc per submitted in-app research survey --
see "Survey" below; anonymous by design, no identifying fields at all)
```
{
  demographics: { ageGroup, fitnessRelationship, fitnessRelationshipOther, trackingFrequency, usedNutritionApp },
  h1: { ...5 Likert 1-5 fields },   // H1 -- cost-effective protein identification
  h2: { ...5 Likert 1-5 fields },   // H2 -- user satisfaction
  h3: { ...5 Likert 1-5 fields },   // H3 -- efficiency comparing products
  sus: { ...4 Likert 1-5 fields },  // adapted System Usability Scale (Brooke, 1996)
  nf: { ...2 Likert 1-5 fields },   // features shipped after the original instrument (store map, theme toggle)
  openEnded: { likedMost, confusing, wrongOrSurprising, wouldChange },
  submittedAt: Date
}
```
See `backend/src/models/SurveyResponse.ts` for exact field keys -- they
mirror `GainsCart_User_Survey.docx` (the ethics-approved instrument)
field-for-field, since the research report's analysis depends on this
exact instrument. Demographic answers store a stable `value` code (e.g.
`'18_24'`, `'recreational_lifter'`), not the display label, so relabeling
a choice later can't silently change what a past submission means.

## Data Pipeline

Separate from the Express app. Plain Node scripts, run on a schedule
(matching Grocer's own update cadence):
1. Daily (~post 6:30am NZ): re-sync `base_v3.duckdb.br` -> upsert `products`
   + `stores` collections with any catalog changes (`sync-products.js`).
2. Daily: for each of the ~30 whitelisted Auckland-area stores (see
   LIMITATIONS.md's geographic-scope section), query that store's price
   parquet via `httpfs` -> insert new `prices` documents (`sync-prices.js`).
3. Ongoing/incremental: OFF nutrition lookups for any product without
   nutrition data yet, respecting OFF's rate limits (small delay between
   requests, identify the app via a proper User-Agent header)
   (`sync-nutrition.js`).
4. Ongoing/incremental, independent of the above: curated per-100g
   reference data for weighed/fresh foods (meat, fish) OFF can never
   barcode-match, matched by product-name keyword instead
   (`sync-fresh-foods.js`).
5. One-time/ad-hoc, not on a recurring schedule: AI-generated fallback
   photos for products with no real image, via Pollinations.ai
   (`backfill-ai-images.js`) -- see "AI Features" below.

## AI Features

Three separate integrations, all via free-tier/keyless services (no paid
API keys required to run the app, though `GROQ_API_KEY` unlocks two of
them -- see `backend/.env.example`):

- **"Why this pick?"** (`backend/src/routes/explain.ts`) -- per-item,
  on-demand explanation of why a specific product ranked well, via Groq's
  free-tier chat completions (`backend/src/services/groq.ts`). Returns a
  clear error if `GROQ_API_KEY` is unset, rather than failing silently.
- **Basket summary** (`backend/src/routes/basketSummary.ts`) -- same Groq
  helper, summarizing the whole ranked list rather than one item.
- **AI-generated fallback photos** -- see `scripts/backfill-ai-images.js`
  and the `products.nutrition.ai_image_url` field above. Uses
  Pollinations.ai's keyless image-generation URL (no API key/billing),
  same pattern as the Store location map below. Always labeled "AI" in
  the UI (`Thumbnail` in `frontend/src/App.tsx`) -- never presented as a
  real product photo. See LIMITATIONS.md for coverage/accuracy caveats.

The app is otherwise fully deterministic -- ranking, filtering, and price
math never touch an LLM.

## Frontend Features

Beyond the core budget -> ranked list flow: a list/table view toggle with
sortable table columns; `rankBy` toggle between `value` (protein-per-dollar
x protein-density) and `protein_density` alone ("leanest"); dietary
preference filters (vegan/vegetarian/allergen-free, OFF-tag-based); a
"New here?" glossary explaining every term for readers with no nutrition
background; per-item "Compare stores" and "Price trend" (both fetched
on-demand, not pre-loaded); a per-item "Store location" map (Google Maps
keyless embed, searched by store name -- there's no address/coordinate
data anywhere in Grocer's dataset, see LIMITATIONS.md); a shareable link
(budget/calorieBudget/dietary/rankBy reflected in the URL's query params);
opt-in light mode (dark is the CLAUDE.md-mandated default, toggled via
`frontend/src/theme.ts`, persisted in `localStorage`); and the in-app
research survey (see below).

## Survey

A standalone page at `/survey` (`frontend/src/Survey.tsx`, `SurveyPage`),
not a modal -- opens in a new tab from a CTA in the main app header, per
explicit user preference. Presented as a multi-step wizard (one section
per screen, progress bar, numbered questions, Back/Next) rather than one
long scroll. Mirrors `GainsCart_User_Survey.docx` (the ethics-approved
instrument) field-for-field -- the wizard changes only how it's
*presented*, never the instrument's content, wording, or field keys, since
the research report's analysis depends on the exact approved instrument.
Submits to `POST /api/survey` (`backend/src/routes/survey.ts`), validated
against a strict whitelist (Likert 1-5 integers, enum choice values, text
capped at 2000 chars), and stores nothing that could identify a
respondent.

## Deployment

Render, via the `render.yaml` blueprint at the repo root: a free-tier Node
web service (`gainscart-backend`) and a static site (`gainscart-frontend`,
with `/api/*` and `/survey` rewrites -- the latter needed because
`/survey` is a full page navigation, not client-side routing, and Render's
static host has no literal `survey/index.html` to serve otherwise).
`MONGODB_URI`/`GROQ_API_KEY` are set directly in the Render dashboard, never
committed.

Render's free tier spins the backend down after ~15 min with no traffic,
causing a slow cold-start (or an outright 502) on the next real request.
Mitigated by `.github/workflows/keep-backend-warm.yml` -- a GitHub Actions
cron (free/unlimited on this public repo) pinging `/api/health` every 10
minutes so it never sits idle long enough to spin down. Not a 100%
guarantee (GitHub's scheduled cron timing isn't exact, and Render's own
maintenance restarts aren't preventable this way) -- the backend also warms
its own price cache at startup and on a background timer regardless, so a
cold start is slow rather than broken.

## Code Style
- Prefer plain, readable code over clever abstractions -- this needs to be
  explainable in a research report.
- Comment WHY for any non-obvious data assumption (price tier chosen, size
  parsing regex, nutrition match logic), not just WHAT the code does.
- No premature optimization -- correctness and clarity first, this is a
  research prototype, not a production system serving real traffic yet.