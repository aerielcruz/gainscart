# GainsCart

Protein-per-dollar grocery optimiser for NZ supermarkets. Give it a budget
and it returns a ranked grocery list showing protein, cost, and
protein-per-dollar for each item, sourced from live Grocer.nz pricing and
Open Food Facts nutrition data.

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

## Project structure

```
frontend/               Vite + React app
backend/
  src/                   Express API (reads MongoDB, never touches DuckDB)
  scripts/
    sync-products.js     Grocer.nz catalog -> `products` + `stores` collections
    sync-nutrition.js    Open Food Facts lookups -> nutrition data on `products`
    sync-prices.js       Live per-store prices -> `prices` collection
    lib/                 Shared helpers (size parsing, OFF lookup, DuckDB, Mongo)
    legacy/              Original prototype scripts, kept for reference only
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
cp .env.example .env   # fill in MONGODB_URI
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

3. **`npm run sync:prices`** -- fetches live prices for the store whitelist
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

- `GET /api/health` -- liveness check
- `GET /api/optimise?budget=50` -- ranked, budget-constrained grocery list.
  Accepts an optional `dietaryPreferences` query param (comma-separated) --
  currently accepted but not enforced, see LIMITATIONS.md.

## Known limitations

See [`LIMITATIONS.md`](./LIMITATIONS.md) for the full, measured writeup --
OFF nutrition match rate, the fresh/weighed-food coverage gap (chicken,
beef, eggs), wrong-barcode-match risk, ranking assumptions, and why price
coverage is scoped to 30 stores.
