import { Fragment, useState } from 'react'

interface OptimiseItem {
  product_id: number
  name: string
  brand: string | null
  size: string | null
  store_name: string
  vendor_name: string
  price_dollars: number
  protein_g: number
  kcal: number
  protein_per_dollar: number
  protein_pct_of_calories: number
  nutrition_source: 'openfoodfacts' | 'curated-reference' | null
  matched_category: string | null
  image_url: string | null
}

interface OptimiseResult {
  budget: number
  totalCost: number
  remainingBudget: number
  totalProteinG: number
  calorieBudget: number | null
  totalCalories: number
  remainingCalorieBudget: number | null
  dietaryFiltersApplied: boolean
  items: OptimiseItem[]
}

interface ExplainState {
  status: 'loading' | 'done' | 'error'
  text?: string
}

const BUDGET_PRESETS = [30, 50, 75, 100]

const DIETARY_OPTIONS = [
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'dairy-free', label: 'Dairy-free' },
  { value: 'gluten-free', label: 'Gluten-free' },
  { value: 'nut-free', label: 'Nut-free' },
  { value: 'egg-free', label: 'Egg-free' },
  { value: 'soy-free', label: 'Soy-free' },
]

function App() {
  const [budget, setBudget] = useState('50')
  const [calorieBudget, setCalorieBudget] = useState('')
  const [dietaryPreferences, setDietaryPreferences] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OptimiseResult | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'table'>('list')
  const [explanations, setExplanations] = useState<Record<number, ExplainState>>({})

  async function runOptimise(budgetValue: string, calorieBudgetValue: string, dietaryValues: string[]) {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const params = new URLSearchParams({ budget: budgetValue })
      if (calorieBudgetValue) params.set('calorieBudget', calorieBudgetValue)
      if (dietaryValues.length > 0) params.set('dietaryPreferences', dietaryValues.join(','))

      const res = await fetch(`/api/optimise?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Request failed (${res.status})`)
      }
      setResult(await res.json())
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    runOptimise(budget, calorieBudget, dietaryPreferences)
  }

  function handlePreset(value: number) {
    setBudget(String(value))
    runOptimise(String(value), calorieBudget, dietaryPreferences)
  }

  function toggleDietary(value: string) {
    setDietaryPreferences((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
  }

  async function fetchExplanation(item: OptimiseItem) {
    setExplanations((prev) => ({ ...prev, [item.product_id]: { status: 'loading' } }))

    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: item.name,
          brand: item.brand,
          size: item.size,
          store_name: item.store_name,
          price_dollars: item.price_dollars,
          protein_g: item.protein_g,
          kcal: item.kcal,
          protein_per_dollar: item.protein_per_dollar,
          protein_pct_of_calories: item.protein_pct_of_calories,
          nutrition_source: item.nutrition_source,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)

      setExplanations((prev) => ({
        ...prev,
        [item.product_id]: { status: 'done', text: body.explanation },
      }))
    } catch {
      setExplanations((prev) => ({ ...prev, [item.product_id]: { status: 'error' } }))
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">
          Gains<span className="text-accent-500">Cart</span>
        </h1>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-balance">
            Get the most protein for your dollar.
          </h2>
          <p className="text-muted">
            Set a budget (in NZD) and we'll build a grocery list ranked by
            protein-per-dollar, using live prices from Auckland-area
            supermarkets.
          </p>
        </div>

        <Glossary />

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted">Budget (NZD)</span>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
                  $
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-36 rounded-md border border-border bg-surface py-2 pl-7 pr-3 text-foreground outline-none focus:border-accent-500"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted">Calorie cap (optional)</span>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="No limit"
                value={calorieBudget}
                onChange={(e) => setCalorieBudget(e.target.value)}
                className="w-36 rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none placeholder:text-muted focus:border-accent-500"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-md bg-accent-600 px-4 py-2 font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading && <Spinner />}
              {loading ? 'Optimising…' : 'Optimise'}
            </button>
          </div>

          <div className="flex gap-2">
            {BUDGET_PRESETS.map((value) => (
              <button
                key={value}
                type="button"
                disabled={loading}
                onClick={() => handlePreset(value)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted transition-colors hover:border-accent-500 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                NZD ${value}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted">Dietary preferences (optional)</span>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map((opt) => {
                const active = dietaryPreferences.includes(opt.value)
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={loading}
                    onClick={() => toggleDietary(opt.value)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      active
                        ? 'border-accent-500 bg-accent-900 text-accent-300'
                        : 'border-border text-muted hover:border-accent-500 hover:text-foreground'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-muted">
              Based on Open Food Facts' community-sourced labels -- not a
              guarantee, and doesn't account for "may contain traces of"
              warnings. Double-check labels if you have a serious allergy.
            </p>
          </div>
        </form>

        {error && (
          <div className="rounded-md border border-accent-900 bg-surface px-4 py-3 text-sm text-accent-300">
            {error}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total cost" value={`NZD $${result.totalCost.toFixed(2)}`} />
              <Stat label="Remaining" value={`NZD $${result.remainingBudget.toFixed(2)}`} />
              <Stat label="Total protein" value={`${result.totalProteinG.toFixed(0)}g`} />
              <Stat
                label="Total calories"
                value={
                  result.calorieBudget != null
                    ? `${result.totalCalories.toFixed(0)} / ${result.calorieBudget} kcal`
                    : `${result.totalCalories.toFixed(0)} kcal`
                }
              />
            </div>

            {result.items.length === 0 ? (
              <p className="rounded-md border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
                No items fit that budget.
              </p>
            ) : (
              <>
                <div className="flex justify-end">
                  <div className="inline-flex rounded-md border border-border p-0.5">
                    {(['list', 'table'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setViewMode(mode)}
                        className={`rounded px-3 py-1 text-xs capitalize transition-colors ${
                          viewMode === mode
                            ? 'bg-accent-600 text-white'
                            : 'text-muted hover:text-foreground'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {viewMode === 'list' ? (
                  <ul className="flex flex-col gap-2">
                    {result.items.map((item, i) => (
                      <ItemRow
                        key={item.product_id}
                        rank={i + 1}
                        item={item}
                        explanation={explanations[item.product_id]}
                        onExplain={() => fetchExplanation(item)}
                      />
                    ))}
                  </ul>
                ) : (
                  <ItemsTable
                    items={result.items}
                    explanations={explanations}
                    onExplain={fetchExplanation}
                  />
                )}
              </>
            )}

            <p className="text-center text-xs text-muted">
              Prices from 30 Auckland-area stores (Woolworths, New World,
              Pak'nSave) — proof of concept, not a national price feed.
              Items marked <span className="uppercase tracking-wide">Estimated</span> use
              a category-level nutrition estimate (e.g. generic chicken
              breast) rather than a verified per-product match. Photos are
              community-uploaded via Open Food Facts and aren't available
              for every item — a 🛒 placeholder shows where there's no
              photo on file.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

function ItemRow({
  rank,
  item,
  explanation,
  onExplain,
}: {
  rank: number
  item: OptimiseItem
  explanation?: ExplainState
  onExplain: () => void
}) {
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-hover sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background text-xs font-medium text-muted">
          {rank}
        </span>

        <Thumbnail src={item.image_url} alt={item.name} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{item.name}</span>
            {item.nutrition_source === 'curated-reference' && (
              <span
                title="Nutrition is a category-level estimate (e.g. generic chicken breast), not a verified product match -- see LIMITATIONS.md"
                className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted"
              >
                Estimated
              </span>
            )}
          </div>
          <div className="text-xs text-muted">
            {[item.brand, item.size, item.store_name].filter(Boolean).join(' · ')}
          </div>
          <ExplainBlock explanation={explanation} onExplain={onExplain} />
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-0.5 pl-10 sm:items-end sm:pl-0">
        <span className="font-semibold text-accent-400">
          {item.protein_per_dollar.toFixed(1)} g/NZD$
        </span>
        <span className="text-xs text-muted">
          NZD ${item.price_dollars.toFixed(2)} · {item.protein_g.toFixed(0)}g protein ·{' '}
          {item.kcal.toFixed(0)}kcal · {(item.protein_pct_of_calories * 100).toFixed(0)}% of cal
        </span>
      </div>
    </li>
  )
}

function Thumbnail({ src, alt, size = 'md' }: { src: string | null; alt: string; size?: 'sm' | 'md' }) {
  const [broken, setBroken] = useState(false)
  const dimensions = size === 'sm' ? 'h-10 w-10' : 'h-12 w-12'

  if (!src || broken) {
    return (
      <div
        title="No product photo available"
        className={`flex ${dimensions} shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted`}
      >
        <span className="text-lg" aria-hidden="true">
          🛒
        </span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className={`${dimensions} shrink-0 rounded-md border border-border bg-background object-cover`}
    />
  )
}

function ExplainBlock({
  explanation,
  onExplain,
}: {
  explanation?: ExplainState
  onExplain: () => void
}) {
  if (!explanation) {
    return (
      <button
        type="button"
        onClick={onExplain}
        className="mt-1 text-xs text-accent-400 underline-offset-2 hover:underline"
      >
        Why this pick? ✨
      </button>
    )
  }

  if (explanation.status === 'loading') {
    return <p className="mt-1 text-xs text-muted">Thinking…</p>
  }

  if (explanation.status === 'error') {
    return (
      <button
        type="button"
        onClick={onExplain}
        className="mt-1 text-xs text-accent-400 underline-offset-2 hover:underline"
      >
        Explanation unavailable -- retry?
      </button>
    )
  }

  return <p className="mt-1 text-xs italic text-muted">{explanation.text}</p>
}

function ItemsTable({
  items,
  explanations,
  onExplain,
}: {
  items: OptimiseItem[]
  explanations: Record<number, ExplainState>
  onExplain: (item: OptimiseItem) => void
}) {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[860px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-xs text-muted">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Photo</th>
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium">Store</th>
            <th className="px-3 py-2 font-medium text-right">Price (NZD $)</th>
            <th className="px-3 py-2 font-medium text-right">Protein (g)</th>
            <th className="px-3 py-2 font-medium text-right">Calories (kcal)</th>
            <th className="px-3 py-2 font-medium text-right">Protein/NZD$ (g)</th>
            <th className="px-3 py-2 font-medium text-right">% of cal from protein</th>
            <th className="px-3 py-2 font-medium">Nutrition source</th>
            <th className="px-3 py-2 font-medium">Why this pick?</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const expanded = expandedId === item.product_id
            const explanation = explanations[item.product_id]
            return (
              <Fragment key={item.product_id}>
                <tr className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                  <td className="px-3 py-2 text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Thumbnail src={item.image_url} alt={item.name} size="sm" />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted">
                      {[item.brand, item.size].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-muted">{item.store_name}</td>
                  <td className="px-3 py-2 text-right">{item.price_dollars.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">{item.protein_g.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right">{item.kcal.toFixed(0)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-accent-400">
                    {item.protein_per_dollar.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(item.protein_pct_of_calories * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {item.nutrition_source === 'curated-reference' ? 'Estimated' : 'Matched'}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedId(expanded ? null : item.product_id)
                        if (!explanation) onExplain(item)
                      }}
                      className="text-xs text-accent-400 underline-offset-2 hover:underline"
                    >
                      {expanded ? 'Hide' : 'Why? ✨'}
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr className="border-b border-border bg-background">
                    <td colSpan={11} className="px-3 py-2 text-xs italic text-muted">
                      {explanation?.status === 'loading' && 'Thinking…'}
                      {explanation?.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => onExplain(item)}
                          className="not-italic text-accent-400 underline-offset-2 hover:underline"
                        >
                          Explanation unavailable -- retry?
                        </button>
                      )}
                      {explanation?.status === 'done' && explanation.text}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Glossary() {
  return (
    <details className="group rounded-md border border-border bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted transition-colors hover:text-foreground">
        <span className="text-accent-400">New here?</span> What the numbers
        mean and how to use this app
        <span className="float-right text-muted transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>

      <div className="flex flex-col gap-4 border-t border-border px-4 py-4 text-sm text-muted">
        <div>
          <h3 className="mb-1 font-medium text-foreground">How to use it</h3>
          <ol className="list-decimal space-y-1 pl-4">
            <li>Type in how much money you want to spend, e.g. NZD $50.</li>
            <li>
              (Optional) If you're also watching how much you eat, set a
              calorie cap too.
            </li>
            <li>
              (Optional) Tick any dietary preferences, e.g. vegan or
              dairy-free.
            </li>
            <li>
              Hit <span className="text-foreground">Optimise</span> -- you'll
              get a list of groceries picked to give you the most protein for
              your money, without going over budget.
            </li>
          </ol>
        </div>

        <div>
          <h3 className="mb-1 font-medium text-foreground">The basics</h3>
          <dl className="flex flex-col gap-2">
            <div>
              <dt className="font-medium text-foreground">Calories (kcal)</dt>
              <dd>
                A unit of energy. Food gives your body energy measured in
                calories -- eat roughly what you burn to maintain your
                weight, more to gain, less to lose.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Protein (g)</dt>
              <dd>
                A nutrient (measured in grams) your body uses to build and
                repair muscle. It's one of three "macros" alongside fat and
                carbs -- this app focuses on protein because it's usually the
                hardest one to get enough of cheaply.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Protein-per-dollar (g/NZD$)</dt>
              <dd>
                How many grams of protein you get for every NZD dollar spent
                on that item. Higher is better value -- it's the main number
                this app ranks everything by.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                % of calories from protein
              </dt>
              <dd>
                What share of an item's energy comes from protein rather
                than fat or carbs. A higher percentage generally means a
                "leaner" source -- e.g. chicken breast is high, peanut butter
                is high-protein but also high-fat so its percentage is lower.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Nutrition source</dt>
              <dd>
                <span className="text-foreground">Matched</span> means we
                found this exact product's real nutrition label.{' '}
                <span className="text-foreground">Estimated</span> means the
                product had no label on file, so we used a generic average
                for that type of food instead (e.g. "chicken breast" in
                general) -- treat it as a rough guide, not exact.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">
                Dietary preferences
              </dt>
              <dd>
                Filters out items that don't fit, e.g. ticking "vegan" hides
                anything containing meat, dairy, or eggs. Based on
                crowd-sourced labels -- not a medical guarantee, so
                double-check packaging yourself if you have a serious
                allergy.
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </details>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function Spinner() {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  )
}

export default App
