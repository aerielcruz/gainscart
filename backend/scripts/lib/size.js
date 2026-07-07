// Ported from legacy/4-rank-protein-per-dollar.js's SQL CASE expression.
// Only handles plain weight/volume sizes (g/kg/ml/l). Pack-count sizes
// ("36pk", "ea") and anything else unparseable return null and are
// excluded downstream -- a documented coverage limitation, not a bug.
export function parseSizeGrams(sizeRaw) {
  if (!sizeRaw) return null
  const size = String(sizeRaw).toLowerCase().trim()

  let match
  if ((match = size.match(/^([\d.]+)\s*kg/))) return parseFloat(match[1]) * 1000
  if ((match = size.match(/^([\d.]+)\s*g/))) return parseFloat(match[1])
  if ((match = size.match(/^([\d.]+)\s*l/))) return parseFloat(match[1]) * 1000
  if ((match = size.match(/^([\d.]+)\s*ml/))) return parseFloat(match[1])
  return null
}
