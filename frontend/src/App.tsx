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

function App() {
  const [budget, setBudget] = useState('50')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<OptimiseResult | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`/api/optimise?budget=${encodeURIComponent(budget)}`)
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold">
          Gains<span className="text-accent-500">Cart</span>
        </h1>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
        <p className="text-muted">
          Protein-per-dollar grocery optimiser for NZ supermarkets.
        </p>

        <form onSubmit={handleSubmit} className="flex items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">Budget (NZD)</span>
            <input
              type="number"
              min="1"
              step="1"
              required
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-32 rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent-500"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-accent-600 px-4 py-2 font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Optimising…' : 'Optimise'}
          </button>
        </form>

        {error && (
          <p className="rounded-md border border-accent-900 bg-surface px-4 py-3 text-sm text-accent-300">
            {error}
          </p>
        )}

        {result && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Total cost" value={`$${result.totalCost.toFixed(2)}`} />
              <Stat label="Remaining" value={`$${result.remainingBudget.toFixed(2)}`} />
              <Stat label="Total protein" value={`${result.totalProteinG.toFixed(0)}g`} />
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="px-4 py-2 font-medium">Item</th>
                    <th className="px-4 py-2 font-medium">Store</th>
                    <th className="px-4 py-2 font-medium">Price</th>
                    <th className="px-4 py-2 font-medium">Protein</th>
                    <th className="px-4 py-2 font-medium">g / $</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.product_id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-xs text-muted">
                          {[item.brand, item.size].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-muted">{item.store_name}</td>
                      <td className="px-4 py-2">${item.price_dollars.toFixed(2)}</td>
                      <td className="px-4 py-2">{item.protein_g.toFixed(0)}g</td>
                      <td className="px-4 py-2 text-accent-400">{item.protein_per_dollar.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.items.length === 0 && (
              <p className="text-sm text-muted">No items fit that budget.</p>
            )}
          </div>
        )}
      </main>
    </div>
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

export default App
