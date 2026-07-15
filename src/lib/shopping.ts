export function groceryCount(item: { count?: number; quantity?: string }): number {
  if (typeof item.count === 'number' && Number.isFinite(item.count)) {
    return Math.max(1, Math.trunc(item.count))
  }
  const legacyCount = Number.parseInt(item.quantity ?? '', 10)
  return Number.isFinite(legacyCount) && legacyCount > 0 ? legacyCount : 1
}
