/** Format a USD cost with adaptive precision (always 2+ significant figures). */
export function formatCost(usd: number | undefined): string {
  if (usd === undefined) return '—'
  if (usd === 0) return '$0.00'
  if (usd >= 0.01) return `~$${usd.toFixed(2)}`
  const digits = Math.max(4, -Math.floor(Math.log10(usd)) + 1)
  return `~$${usd.toFixed(digits).replace(/0+$/, '')}`
}

/** Format a numeric delta with explicit sign. */
export function formatDelta(delta: number, precision: number = 4): string {
  const sign = delta >= 0 ? '+' : ''
  return `${sign}${delta.toFixed(precision)}`
}
