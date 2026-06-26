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

export function parseCapitalManInput(
  raw: string,
): number | null {
  const cleaned = raw.replace(/[,，]/g, '').trim()
  if (!cleaned) return null
  const man = Number(cleaned)
  if (!Number.isFinite(man) || man <= 0) return null
  return Math.round(man * 10_000)
}

export function capitalYenToManInput(
  yen: number | null | undefined,
): string {
  if (yen == null || !Number.isFinite(yen) || yen <= 0) return ''
  const man = yen / 10_000
  return Number.isInteger(man) ? String(man) : String(man)
}

export function parseEmployeeCountInput(raw: string): number | null {
  const cleaned = raw.replace(/[,，]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

export function normalizeExternalUrl(raw: string | null | undefined): string | null {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  if (/^www\./i.test(value)) return `https://${value}`
  if (value.includes('.')) return `https://${value}`
  return null
}
