# Known Limitations

Concrete, measured limitations of the current GainsCart pipeline and optimiser,
recorded for the DSR research write-up. These are documented constraints, not
bugs to chase to zero -- see CLAUDE.md's framing on OFF coverage for the same
philosophy applied throughout.

## Nutrition data coverage

- **109,289** total products synced from Grocer.nz's base catalog.
- **16,915** (15.5%) have no barcode at all and can never be looked up on Open
  Food Facts (OFF).
- Of the **92,374** barcoded products, only **5,265 matched** on OFF --
  a **5.7% match rate**. The remaining 87,109 were attempted and confirmed
  misses (`nutrition.matched: false`, `nutrition.synced_at` set so they aren't
  re-attempted).
- OFF is a crowd-sourced, internationally-skewed database. NZ private-label
  and home-brand products are structurally under-represented, exactly as
  flagged in CLAUDE.md before any data was pulled.

## Fresh / weighed foods are almost entirely excluded

This is the most consequential gap: **chicken, beef, fish, and eggs --
the most intuitive "protein foods" -- barely appear in results.**

- **15,258** products are sold by weight (`unit: "kg"`, no fixed package
  size). Only **3,643** of those have any barcode value at all.
- Of those 3,643, **zero** matched on OFF (0% hit rate for the entire
  category). Inspecting the barcodes (e.g. `09400597055697` on "NZ Chicken
  Breast") shows they're internal, store-generated scale-label codes, not
  real GS1 barcodes -- OFF has no way to recognize them, regardless of the
  barcode-format-guessing described below.
- Pack-counted items (e.g. `"12pk"` egg cartons) have the same problem from
  a different angle: `parseSizeGrams()` deliberately returns `null` for
  pack-counts (there's no way to convert "12 eggs" to a gram weight without
  assuming an average egg weight), so even an OFF-matched egg product can't
  be ranked.
- **Fix applied:** products with `unit: "kg"` are now accepted using the
  price's own per-kg basis (1000g reference weight) instead of requiring
  `size_grams` -- see `getOptimisedList` in `optimiser.ts`. This is
  correct but currently inert: there's no OFF data for any weighed product
  for it to act on.
- **Real fix, not yet built:** a small hand-curated reference table (per-100g
  nutrition for ~15-20 generic categories: chicken breast, beef mince, salmon,
  whole eggs, etc.) matched by product name/keyword instead of barcode, with
  a distinct `nutrition.source` value so it's clearly separated from
  barcode-verified OFF data in any analysis. Deliberately deferred -- keyword
  rules need care (raw "chicken breast" name-matching pulled in cat food, dog
  food, and pies during testing) and category-level estimates are a weaker
  evidence tier than product-specific OFF matches.

## Barcode-format-guessing risks false-positive matches

To improve match rate, barcode lookups try the barcode as given, fully
stripped of leading zeros, and padded to each standard GTIN length
(8/12/13/14) -- ported from the original prototype script.

- **Confirmed concrete example:** `"Orchard Gold Premium Mixed Berries Frozen
  Fruit"` matched to OFF's `"Clean Lean Protein Rich Chocolate"` -- a
  completely unrelated product. One of the padded/stripped barcode variants
  happened to coincide with a real but wrong product in OFF's database.
- **Attempted automated detection:** a name-token-overlap heuristic flagged
  453 of 5,085 matched products (8.9%) as having zero shared words between
  the Grocer name and the OFF name. Manually reviewing the flagged examples
  showed most are **false alarms** -- OFF stores many entries in German,
  French, or Italian, or under a different brand name (e.g. `"Bitburger"`
  for `"Premium Pilsner"`, `"Tonno callipo"` for `"Yellowfin Tuna"`). This
  heuristic is not reliable enough to use as an automatic filter.
- **Mitigation in place:** a sanity filter rejects nutrition values that are
  physically impossible (any macro > 100g/100g, or protein + fat + carbs >
  100g/100g). This catches egregious cases (e.g. OFF's own data listed
  Brunswick Sardines at 286g protein/100g -- impossible, and excluded
  automatically) but **does not** catch matches like the berries case, where
  the wrong product's macro values are individually plausible-looking.
- **Net effect:** an unknown but likely small fraction of the 5,265 "matched"
  products are matched to the wrong item. No cheap, reliable way was found to
  bound this further within the current data sources.

## Ranking methodology assumptions

All in `backend/src/services/optimiser.ts`, chosen and documented rather than
silently assumed:

- **Price tier:** `effective_price_cent = COALESCE(sale_price_cent,
  original_price_cent)`. Club-card and online prices are ignored on purpose
  (not every shopper has a club card). Carried over from the original
  prototype's `PRICE_EXPR`.
- **Protein-density threshold:** products must have >= 10g protein per 100g
  to be considered. Without this, cheap starchy staples (flour, dry pasta)
  dominated rankings purely on price-per-gram economics.
- **Protein-to-calorie threshold:** >= 20% of a product's calories must come
  from protein. This is what actually separates lean protein sources from
  "technically has protein" staples -- flour clears the density bar (~10g/100g)
  but only derives ~11% of its calories from protein.
- **Both thresholds are reasoned defaults, not empirically validated** against
  a real nutrition target or literature. Worth revisiting for the writeup.
- **Budget fill is greedy, not a true knapsack.** Candidates are sorted by
  protein-per-dollar descending and added while they fit the remaining
  budget. This is a documented simplification, not globally optimal.
- **Dietary preferences are accepted but not enforced.** Neither Grocer.nz
  nor OFF's `per_100g` fields include allergen/dietary-tag data, so there is
  currently no schema field to filter on. The API returns
  `dietaryFiltersApplied: false` so this is visible in the response, not
  silently dropped.

## Geographic scope: 30 Auckland-area stores, not all 465

- The full Grocer.nz catalog covers **465 enabled stores** nationwide. Price
  data is scoped to **30 stores** (18 Woolworths, 8 New World, 4 Pak'nSave)
  within roughly 10km of the Auckland CBD.
- **This was an infrastructure-driven decision, not a research-design
  choice.** A full sync across all 465 stores hit MongoDB Atlas's free-tier
  (M0) 512MB storage quota after 121 stores (~433MB, ~1.84M price docs).
  Extrapolated, full coverage would need roughly **1.6GB** -- over 3x the
  free-tier limit.
- The 30-store whitelist was curated by matching store **names** against
  known Auckland suburbs -- there is no address or coordinate data anywhere
  in the Grocer.nz dataset (confirmed via `DESCRIBE public_stores`: only
  `id, vendor_id, name, is_enabled`). "Within ~10km" is therefore a
  judgement call, not a computed distance, and a few borderline cases
  (Devonport, Mt Wellington, Kelston) could reasonably be argued either way.
- Final scoped price data: **438,855 documents**, **137.6MB** (27% of the
  512MB quota) -- comfortable headroom for this scope, but daily re-syncs
  (as CLAUDE.md's pipeline design intends) will need a retention/TTL
  strategy before this becomes a recurring job. At ~103MB per full sync run,
  daily syncing with no cleanup would refill the quota in under 4 days.

## MongoDB Atlas free-tier constraints

- The M0 (free/shared) tier **rejects `allowDiskUse: true` outright** for
  aggregations, even when explicitly requested by the client. The original
  `getOptimisedList` aggregation ($group over the full `prices` collection)
  exceeded the 100MB in-memory limit for `$group` and could not opt into
  disk spilling as MongoDB's own error message suggests.
- **Resolution:** replaced the aggregation pipeline with a plain in-memory JS
  reduction (`Price.find().lean()` + `Map`-based grouping) in
  `optimiser.ts`. This works because the scoped `prices` collection (30
  stores, ~440K docs) comfortably fits in Node's memory -- this approach
  would need revisiting if the store scope is later expanded.
