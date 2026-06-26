export function formatCapitalYen(yen: number | null | undefined): string | null {
  if (yen == null || !Number.isFinite(yen) || yen <= 0) return null
  const n = Math.round(yen)
  if (n >= 100_000_000) {
    const oku = n / 100_000_000
    return Number.isInteger(oku)
      ? `${oku.toLocaleString('ja-JP')}億円`
      : `${oku.toFixed(1)}億円`
  }
  if (n >= 10_000) {
    const man = n / 10_000
    return Number.isInteger(man)
      ? `${man.toLocaleString('ja-JP')}万円`
      : `${man.toFixed(1)}万円`
  }
  return `${n.toLocaleString('ja-JP')}円`
}

export function formatEmployeeCount(
  count: number | null | undefined,
): string | null {
  if (count == null || !Number.isFinite(count) || count <= 0) return null
  return `${Math.round(count).toLocaleString('ja-JP')}名`
}

export function normalizeExternalUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (/^www\./i.test(value)) return `https://${value}`
  if (value.includes('.')) return `https://${value}`
  return null
}
