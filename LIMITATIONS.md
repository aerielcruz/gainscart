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
- **Fix built:** a hand-curated reference table (per-100g nutrition for 14
  generic categories -- chicken breast/thigh/mince, beef/beef mince,
  lamb, pork, venison, sausages, bacon, salmon, tuna, white fish fillets)
  matched by product-name keyword instead of barcode --
  `backend/scripts/lib/freshFoodReference.js`, applied via
  `sync-fresh-foods.js`. Tagged with `nutrition.source: 'curated-reference'`
  (and `nutrition.matched_category` recording which category matched), kept
  distinct from `'openfoodfacts'` since it's a weaker evidence tier
  (category-level estimate, not a product-specific lookup) and the
  optimiser/pipeline never let it overwrite a genuine OFF match.
  - **No eggs.** Every `unit: 'kg'` product matching "egg" in the live
    catalog turned out to be a mayo-based deli salad (e.g. "Egg & Potato
    Salad"), not plain eggs -- eggs are still unrankable (pack-counted,
    see above), unchanged by this fix.
  - **Result: 6,107 of 15,258 weighed products now have nutrition data**,
    up from 0. Chicken thighs/drumsticks, tuna steaks, and pork roasts now
    surface in `/api/optimise` results where previously the only
    "protein foods" it could find were dry goods and OFF-matched packaged
    items.
  - **Keyword rules needed real iteration against the live catalog** to
    stay accurate -- initial passes wrongly matched pet food/treats
    (checked for "pet"/"dog" but not e.g. `"Bacon Lobe Chews Dog Treat"`),
    mayo-based deli salads, pastry pies (`"Bakehouse Steak Family Pie"`),
    organ meats (liver/kidney/heart/tripe/tongue/gizzards -- different
    nutrition profile from muscle meat), bony/low-yield cuts (bones,
    fish/pig heads, chicken necks, tendons), composite/bakery items that
    happen to contain a meat word (`"Swiss Roll Beef"`, `"Cheese & Bacon
    Muffin"`, `"Chicken Pasta Bake"`), and pork crackling/crackle (skin
    and fat, not muscle meat -- `"crackling"` wasn't caught by an initial
    `"crackle"`-only exclude rule). Each was found by pulling real product
    names for a category from the live catalog and eyeballing for
    false positives, not guessed in advance -- `sync-fresh-foods.js` is
    written to be safe to re-run after a keyword-rule fix (it
    re-evaluates and reverts any product previously tagged
    `curated-reference` that no longer matches, rather than leaving a
    stale guess in place).
  - **Known remaining approximation, not chased further:** a handful of
    non-standard cuts still get the generic category's lean-fillet/cut
    nutrition even though their true composition differs meaningfully --
    whole fish sold gutted-but-otherwise-intact (e.g. "NZ Kahawai Whole",
    "Whole Trevally", where a fraction of the priced weight is
    bone/skin/guts, not edible fillet) and fish collar/wing cuts (e.g.
    "NZ Blue Moki Wings", notably fattier than a lean fillet). Low
    enough volume (single digits per term) that further keyword-carving
    hit diminishing returns; flagged here rather than silently accepted.
  - **Nutrition values are generic reference figures** (in the spirit of
    USDA FoodData Central-style raw/as-sold composition data), not
    NZ-specific or brand-specific lab results -- a reasoned estimate per
    category, not measured per product. Documented the same way as the
    protein-density/ratio thresholds below: a defensible default, not an
    empirically validated one.

## Product photo coverage

- Product photos (`nutrition.image_url`) are sourced from OFF's
  `image_front_url` field, fetched at the same time as nutrition data --
  only available for the `openfoodfacts`-matched slice (**5,265** products),
  never for `curated-reference` fresh foods (no barcode to fetch a photo
  for by definition).
- Of those 5,265 OFF-matched products, only **895 (17.0%)** have a photo on
  file. Photo coverage is a separate crowd-sourcing effort from data
  coverage -- a product can have verified nutrition and still have no
  community-uploaded image.
- **Coverage skews away from the items the optimiser actually recommends.**
  OFF's photo contributions concentrate on prominent/branded packaged goods;
  the cheap bulk staples that usually win on protein-per-dollar (lentils,
  frozen berries, tinned tuna) are exactly the category least likely to have
  one. At a typical $30-50 budget, it's common for **zero** returned items
  to have a photo -- this is expected given the above, not a rendering bug.
  The frontend shows a 🛒 placeholder wherever no photo is on file.

## AI-generated fallback images

- Given the coverage gap above, products with no real photo can instead show
  an AI-generated illustration, produced by `scripts/backfill-ai-images.js`
  via [Pollinations.ai](https://pollinations.ai) -- a free, keyless image
  generation service (no API key/billing, same "unofficial URL" pattern used
  for the Store location map). Only ever generated for products eligible to
  appear in results at all (`nutrition.matched` + meets the protein
  threshold `optimiser.ts` filters on), not the full catalog.
- These are **illustrations from a text prompt** (brand + product name), not
  photos of the actual product on shelf -- packaging, exact cut/variety, and
  branding are not guaranteed to match. Always shown with a visible "AI"
  badge on the thumbnail (`title` attribute spells this out on hover); never
  presented as if it were a real product photo.
- Generation runs as a one-time backfill script, not on-demand -- images are
  cached in `nutrition.ai_image_url` once generated, so a page load never
  pays generation latency/cost. Failures (timeouts, rate limits from the
  free service) are simply left for the next run, same resumable pattern as
  `sync-nutrition.js`.

## Incident: image backfill briefly broke fresh-food matching

Recorded as a measured incident (per this document's framing), not scrubbed
from the record -- the bug, its detection, and its fix.

- Adding `nutrition.image_url` required a backfill pass over already-matched
  products in `sync-nutrition.js`. The backfill's selection query (`matched:
  true` + a field missing) pulled in `curated-reference` fresh-food matches
  (chicken, beef, lamb, fish -- see above) for the first time, since those
  had never had `image_url` either.
- Those products have no barcode by design (matched by product-name keyword,
  not GS1 barcode). The script's existing "no barcode" guard clause --
  written when only genuinely-unmatched products could reach it -- fired
  for them too, and unconditionally set `nutrition.matched: false`.
  **Result: 4,465 correctly-matched fresh/weighed-food products were
  silently dropped from the optimiser's candidate pool** (which filters on
  `matched: true`), while their actual `per_100g` nutrition data sat
  untouched and correct in the same document -- a mismatch between two
  fields that should never disagree.
- **Caught by:** a routine post-backfill sanity check (comparing
  `matched: true` counts before/after) surfaced a count drop that a
  single-field check wouldn't have. Root-caused by tracing a sample
  affected document (`Lamb Chops Shoulder Marinated`) -- valid
  `per_100g`/`matched_category` alongside `matched: false` doesn't occur
  anywhere else in the pipeline's logic, which pinpointed the guard clause.
- **Fixed:** the guard clause now checks `nutrition.source ===
  'curated-reference'` first and leaves those records' `matched` status
  alone. **Repaired:** the 4,465 affected documents were restored via a
  scoped `matched: true` update (filtered on `source: 'curated-reference'`
  + `matched: false` + non-null `per_100g.protein_g`, so it could only ever
  touch documents in exactly this broken state) -- verified afterward that
  `matched: true` count (11,372) again equals `openfoodfacts` (5,265) +
  `curated-reference` (6,107) matches, and a re-run of the fixed script
  against a fresh batch showed no recurrence.
- **Why it matters for the write-up:** this is a concrete example of the
  general risk in evolving a schema incrementally across pipeline scripts
  that assume different invariants about the same field (`matched`) --
  worth a mention if the report discusses pipeline maintainability, not
  just one-time data quality.

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
  physically impossible: any macro > 100g/100g, protein + fat + carbs >
  100g/100g, or protein's calorie share > 100% of total energy. This catches
  egregious cases (e.g. OFF's own data listed Brunswick Sardines at 286g
  protein/100g, and separately "WW Salted & Roasted Pistachios" at
  `energy_kj: 2` -- a data-entry error, correct product match but ~1300x too
  low, which alone produced a 17,573% protein-of-calories reading before the
  ratio cap was added) but **does not** catch matches like the berries case,
  where the wrong product's macro values are individually plausible-looking.
- **Net effect:** an unknown but likely small fraction of the 5,265 "matched"
  products are matched to the wrong item. No cheap, reliable way was found to
  bound this further within the current data sources. Since the ranking
  score (below) multiplies protein-per-dollar by protein-quality, the
  berries case now ranks **#1** for a $30-50 budget -- a known-bad data
  point made more visible by the scoring change, not a new error.

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
- **Ranking score = protein_per_dollar x protein_pct_of_calories.**
  Candidates are sorted by this combined score rather than protein-per-dollar
  alone, so a lean, high-quality protein source can outrank a cheaper but
  carb/fat-heavy one at a similar price. Multiplicative rather than a
  weighted sum so neither factor dominates alone -- also a reasoned default,
  not empirically tuned. This is what surfaced the pistachio energy-value
  bug above: multiplying by an unbounded ratio amplifies any single bad
  data point far more than the old protein-per-dollar-only sort did.
- **Budget fill is greedy, not a true knapsack.** Candidates are sorted by
  the score above descending and added while they fit the remaining budget.
  This is a documented simplification, not globally optimal.
- **Dietary preferences are now enforced, via a different OFF endpoint
  than nutrition.** `per_100g` nutriments never had allergen/diet data --
  but OFF separately exposes `ingredients_analysis_tags` (vegan/vegetarian
  status, computed by OFF from the ingredients list) and `allergens_tags`
  (declared allergens), which the original nutrition sync never requested.
  Added a `nutrition.dietary` field and backfilled it for all previously-
  matched products (a second OFF lookup pass, ~1.3s/product since these are
  confirmed hits with no barcode-candidate retries needed -- much faster
  than the original ~26hr sync). Recognized preferences: `vegan`,
  `vegetarian`, and `<allergen>-free` for milk/gluten/nuts+peanuts/eggs/
  soybeans/fish/crustaceans+molluscs/sesame.
  - **Not a safety guarantee.** This is OFF's community-sourced labelling,
    not verified against source ingredient lists. It also does not check
    `traces_tags` ("may contain traces of") -- a genuine cross-contamination
    risk for allergy-sensitive users that this filter is blind to. The
    frontend surfaces this caveat directly next to the filter controls
    rather than only in this document.
  - **vegan/vegetarian unknown status is treated as excluded, not included**
    -- if OFF hasn't analyzed a product's ingredients (common), it won't
    show up under "Vegan" even if it likely qualifies. Conservative by
    design (favors false exclusions over false inclusions for a dietary
    claim), but it does shrink the effective candidate pool further on top
    of the existing ~6% nutrition match rate.
- **No macro-preference filter (carbs/fat priority) yet.** Considered adding
  a way to optimize for "more carbs" or "more fat" alongside protein, but
  deferred -- the interaction model needed deciding first (pick one macro to
  rank by, vs. independent minimum-threshold filters per macro that could
  combine), and it's a meaningfully different feature from the calorie
  budget below, not just a variable swap. Revisit if there's a concrete use
  case (e.g. bulking-focused shoppers wanting a carb-forward ranking).
- **Calorie budget is a hard per-item cap during greedy fill, not a
  nutrition target.** `calorieBudget` (optional) stops adding items once
  the running total would exceed it, alongside the existing dollar-budget
  check -- same greedy, non-knapsack simplification noted above. It has no
  awareness of daily targets, meal splitting, or maintenance/surplus/deficit
  goals; it's purely "don't let this grocery list exceed N total kcal."

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
