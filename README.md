# GainsCart

Protein-per-dollar grocery optimiser for NZ supermarkets. Give it a budget
and it returns a ranked grocery list showing protein, cost, and
protein-per-dollar for each item, sourced from live Grocer.nz pricing,
Open Food Facts nutrition data, and a curated reference table for fresh
foods (chicken, beef, fish, etc.) OFF can't barcode-match.

This is also the backing artifact for an AIS Design Science Research (DSR)
applied research project -- see [`CLAUDE.md`](./CLAUDE.md) for the full
project brief and [`LIMITATIONS.md`](./LIMITATIONS.md) for measured findings
and known gaps.

**Status: proof of concept.** Price data currently covers 30 Auckland-area
stores (Woolworths, New World, Pak'nSave), not the full national catalog --
see LIMITATIONS.md for why.

## Tech stack

- **Frontend**: Vite + React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + MongoDB (Mongoose)
- **Data pipeline**: plain Node scripts (not part of the Express app) that
  pull from Grocer.nz's public DuckDB/parquet exports and Open Food Facts,
  and write into MongoDB

## Frontend features

Beyond entering a budget and getting a ranked list: a list/table view
toggle with sortable columns; a "Best value" vs "Leanest" rank toggle;
dietary preference filters (vegan/vegetarian/allergen-free); a "New here?"
glossary for readers with no nutrition background; per-item "Why this
pick?" (AI explanation), "Compare stores", "Price trend", and "Store
location" (map); a whole-basket AI summary; a shareable results link;
opt-in light mode; and an in-app research survey at `/survey`. See
[`CLAUDE.md`](./CLAUDE.md)'s "Frontend Features"/"AI Features"/"Survey"
sections for the details and the data/limitations behind each.

## Project structure

```
frontend/               Vite + React app
backend/
  src/                   Express API (reads MongoDB, never touches DuckDB)
  scripts/
    sync-products.js         Grocer.nz catalog -> `products` + `stores` collections
    sync-nutrition.js        Open Food Facts lookups -> nutrition data on `products`
    sync-fresh-foods.js      Curated per-100g reference data for weighed/fresh foods OFF can't match
    sync-prices.js           Live per-store prices -> `prices` collection
    backfill-ai-images.js    One-time/ad-hoc: AI-generated fallback photos (Pollinations.ai) for products with no real image
    lib/                     Shared helpers (size parsing, OFF lookup, fresh-food reference, DuckDB, Mongo)
    legacy/                  Original prototype scripts, kept for reference only
render.yaml              Render deployment blueprint (backend + frontend)
.github/workflows/       GitHub Actions cron keeping the free-tier backend from spinning down
```

## Prerequisites

- Node.js 20+
- A MongoDB connection string (Atlas free tier works for this scope -- see
  LIMITATIONS.md's note on the 512MB storage quota before expanding store
  coverage)

## Setup

**Backend:**

```bash
cd backend
npm install
cp .env.example .env   # fill in MONGODB_URI; GROQ_API_KEY is optional --
                       # leave blank to disable "Why this pick?"/basket
                       # summary rather than fail silently (see .env.example)
npm run dev            # http://localhost:4000
```

**Frontend** (separate terminal):

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173 (or next free port) -- proxies /api to the backend
```

## Populating the database

The optimiser has nothing to rank until the pipeline has run. From
`backend/`, in order:

1. **`npm run sync:products`** -- downloads Grocer.nz's base catalog and
   upserts `products` + `stores`. Took ~30-45 minutes against a ~109K-row
   catalog in testing (batched writes to stay under Atlas's write time
   limit -- see LIMITATIONS.md). Safe to re-run any time; never overwrites
   nutrition data already fetched by step 2.

2. **`npm run sync:nutrition`** -- looks up barcodes on Open Food Facts, 500
   products per run (keeps OFF's rate limits happy). **Re-run repeatedly**
   to work through the full catalog -- each run picks up the next
   un-attempted batch and stops re-trying confirmed misses. Expect a low
   match rate (~6% of barcoded products); see LIMITATIONS.md. Covering the
   full ~109K-product catalog took **~26 hours** of repeated runs in
   testing (~500 products / ~13 min per run, run back-to-back).

3. **`npm run sync:fresh-foods`** -- fills nutrition for weighed products
   (`unit: "kg"` -- fresh meat, fish) that OFF can never barcode-match
   (they use store-generated scale-label codes, not real GS1 barcodes).
   Matches product names against a hand-curated per-100g reference table
   instead -- see LIMITATIONS.md for the full list of keyword-matching
   false positives found and excluded (pet food, organ meats, pastry
   pies, etc.). Took a few seconds against the ~15K-product `unit: "kg"`
   slice in testing. Safe to re-run any time, including after editing the
   keyword rules in `scripts/lib/freshFoodReference.js` -- it re-evaluates
   and corrects previously-matched products rather than only filling new
   ones.

4. **`npm run sync:prices`** -- fetches live prices for the store whitelist
   hardcoded in `scripts/sync-prices.js` (`STORE_WHITELIST`, currently 30
   Auckland-area stores). Took ~1-2 minutes for 30 stores in testing.
   Re-run whenever you want fresher prices; each run inserts a fresh batch
   of price documents rather than overwriting (see the pipeline's
   time-series design note in `CLAUDE.md` if you want to add retention/TTL
   before scheduling this to run recurringly).

To track different stores, edit `STORE_WHITELIST` in `sync-prices.js` --
note the 512MB free-tier ceiling if you widen it significantly (see
LIMITATIONS.md).

## API

- `GET /api/health` -- liveness check (also what the GitHub Actions
  keep-alive cron pings, see Deployment below)
- `GET /api/optimise?budget=50` -- ranked, budget-constrained grocery list.
  - `dietaryPreferences` (optional, comma-separated) -- enforced via OFF's
    vegan/vegetarian/allergen tags. Recognized values: `vegan`,
    `vegetarian`, and `<allergen>-free` for
    dairy/gluten/nut/egg/soy/fish/shellfish/sesame. 400s on an unrecognized
    value. Not a medical/allergy-safety guarantee -- see LIMITATIONS.md.
  - `calorieBudget` (optional) -- hard cap on total kcal added during the
    greedy budget fill, alongside the dollar budget.
  - `rankBy` (optional, `value` | `protein_density`, default `value`) --
    `value` ranks by protein-per-dollar x protein-density; `protein_density`
    ("Leanest" in the UI) ranks by protein-per-calorie alone. 400s on an
    unrecognized value.
- `POST /api/explain` -- "Why this pick?": one-item AI explanation via Groq.
  Body is the specific item fields the prompt needs (name, store_name,
  price_dollars, protein_g, kcal, protein_per_dollar,
  protein_pct_of_calories, nutrition_source, brand/size optional) -- 502s
  with a clear error if `GROQ_API_KEY` is unset or Groq is unreachable.
- `POST /api/explain-basket` -- whole-basket AI summary, same Groq
  dependency as above. Body: itemCount, totalCost, totalProteinG,
  totalCalories, and the six micro totals (fat/saturated fat/carbs/
  sugars/fiber/sodium), plus `topItemNames` (capped to 10 server-side).
- `GET /api/price-comparison/:productId` -- every tracked store's current
  price for one product (not just the cheapest one the optimiser picked).
  Pure re-read of already-synced `prices` data, no external calls.
- `GET /api/price-trend/:productId` -- 7-day price trend for one product,
  queried live from Grocer's per-product price-history parquet (see
  CLAUDE.md's Data Sources note on that file's real schema). Cached 6h
  server-side per product.
- `POST /api/survey` -- submits one anonymous research survey response
  (see CLAUDE.md's Survey section). Strict whitelist validation --
  Likert answers must be integers 1-5, choice fields must match a known
  value code, free text is capped at 2000 chars.

## Deployment

Deployed on Render via the [`render.yaml`](./render.yaml) blueprint --
a free-tier Node web service for the backend and a static site for the
built frontend. `MONGODB_URI`/`GROQ_API_KEY` are set in the Render
dashboard, never committed. A GitHub Actions cron
([`.github/workflows/keep-backend-warm.yml`](./.github/workflows/keep-backend-warm.yml))
pings `/api/health` every 10 minutes so the free-tier backend doesn't spin
down after ~15 min idle -- see CLAUDE.md's Deployment section for the full
rationale and caveats.

## Known limitations

See [`LIMITATIONS.md`](./LIMITATIONS.md) for the full, measured writeup --
OFF nutrition match rate, the curated fresh-food reference table and its
residual approximations, wrong-barcode-match risk, ranking assumptions,
dietary-filter caveats, and why price coverage is scoped to 30 stores.
