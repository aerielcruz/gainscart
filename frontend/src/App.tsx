import { useState } from 'react'

interface OptimiseItem {
  product_id: number
  name: string
  brand: string | null
  size: string | null
  store_name: string
  vendor_name: string
  price_dollars: number
  protein_g: number
  protein_per_dollar: number
  protein_pct_of_calories: number
}

interface OptimiseResult {
  budget: number
  totalCost: number
  remainingBudget: number
  totalProteinG: number
  dietaryFiltersApplied: boolean
  items: OptimiseItem[]
}

const BUDGET_PRESETS = [30, 50, 75, 100]

function App() {
  const [budget, setBudget] = useState('50')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OptimiseResult | null>(null)

  async function runOptimise(budgetValue: string) {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`/api/optimise?budget=${encodeURIComponent(budgetValue)}`)
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
    runOptimise(budget)
  }

  function handlePreset(value: number) {
    setBudget(String(value))
    runOptimise(String(value))
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
            Set a budget and we'll build a grocery list ranked by
            protein-per-dollar, using live prices from Auckland-area
            supermarkets.
          </p>
        </div>

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
                ${value}
              </button>
            ))}
          </div>
        </form>

        {error && (
          <div className="rounded-md border border-accent-900 bg-surface px-4 py-3 text-sm text-accent-300">
            {error}
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Total cost" value={`$${result.totalCost.toFixed(2)}`} />
              <Stat label="Remaining" value={`$${result.remainingBudget.toFixed(2)}`} />
              <Stat label="Total protein" value={`${result.totalProteinG.toFixed(0)}g`} />
            </div>

            {result.items.length === 0 ? (
              <p className="rounded-md border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
                No items fit that budget.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {result.items.map((item, i) => (
                  <ItemRow key={item.product_id} rank={i + 1} item={item} />
                ))}
              </ul>
            )}

            <p className="text-center text-xs text-muted">
              Prices from 30 Auckland-area stores (Woolworths, New World,
              Pak'nSave) — proof of concept, not a national price feed.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

function ItemRow({ rank, item }: { rank: number; item: OptimiseItem }) {
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border bg-surface px-4 py-3 transition-colors hover:bg-surface-hover sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background text-xs font-medium text-muted">
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.name}</div>
          <div className="text-xs text-muted">
            {[item.brand, item.size, item.store_name].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-0.5 pl-10 sm:items-end sm:pl-0">
        <span className="font-semibold text-accent-400">
          {item.protein_per_dollar.toFixed(1)} g/$
        </span>
        <span className="text-xs text-muted">
          ${item.price_dollars.toFixed(2)} · {item.protein_g.toFixed(0)}g protein ·{' '}
          {(item.protein_pct_of_calories * 100).toFixed(0)}% of cal
        </span>
      </div>
    </li>
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
