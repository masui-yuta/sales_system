import data from './target-industries.json'
import gepsItems from './geps-items.json'
import gepsToTarget from './geps-to-target.json'

export type TargetIndustry = {
  code: string
  name: string
  patterns: string[]
}

export const TARGET_INDUSTRIES = data as TargetIndustry[]
export const GEPS_ITEMS = gepsItems as Record<string, string>
export const GEPS_TO_TARGET = gepsToTarget as Record<string, string>

const GENERIC_LABEL = /^[A-Z]:[^:]{1,30}$/
const GENERIC_GRADE = /^[A-Z]\|+\|*$/
const FORMATTED_TARGET = /^(\d{3})\s+(.+)$/

/** gBizINFO の粗い分類（E:製造業 等）は変換対象外 */
export function isGenericIndustryLabel(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  return GENERIC_LABEL.test(t) || GENERIC_GRADE.test(t)
}

/** 215|219 / 215 / 219 などから3桁コードを抽出 */
export function parseIndustryCodes(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []

  const seen = new Set<string>()
  const codes: string[] = []

  for (const part of raw.normalize('NFKC').split(/[|／/、,\s]+/)) {
    const c = part.trim()
    if (/^\d{3}$/.test(c) && !seen.has(c)) {
      seen.add(c)
      codes.push(c)
    }
  }

  return codes
}

function compilePattern(source: string): RegExp {
  return new RegExp(source, 'i')
}

function isSteelMaintenanceContext(text: string): boolean {
  return /メンテナンス|保守工事|プラント.*設計|建設業|土木工事|設備工事/.test(
    text,
  )
}

export function matchTargetIndustry(
  raw: string | null | undefined,
): TargetIndustry | null {
  if (!raw?.trim()) return null

  const text = raw.normalize('NFKC')
  const steelCtx = isSteelMaintenanceContext(text)

  for (const item of TARGET_INDUSTRIES) {
    if (steelCtx && ['221', '223', '224', '229'].includes(item.code)) {
      continue
    }
    for (const pattern of item.patterns) {
      if (compilePattern(pattern).test(text)) {
        return item
      }
    }
  }

  return null
}

export function findTargetIndustryByCode(
  code: string | null | undefined,
): TargetIndustry | undefined {
  if (!code?.trim()) return undefined
  return TARGET_INDUSTRIES.find((i) => i.code === code.trim())
}

/** 全省庁統一資格コード → 営業対象の日本標準産業分類 */
export function matchTargetFromGepsCodes(
  codes: string[],
): TargetIndustry | null {
  for (const target of TARGET_INDUSTRIES) {
    for (const code of codes) {
      if (GEPS_TO_TARGET[code] === target.code) {
        return target
      }
    }
  }
  return null
}

export function formatIndustryLabel(item: TargetIndustry): string {
  return `${item.code} ${item.name}`
}

export function formatGepsCodesLabel(codes: string[]): string {
  return codes
    .map((code) => {
      const name = GEPS_ITEMS[code]
      return name ? `${code} ${name}` : `${code}（名称未登録）`
    })
    .join(' / ')
}

export function resolveIndustryLabel(
  raw: string | null | undefined,
  options: { preferTarget?: boolean } = {},
): string | null {
  if (!raw?.trim()) return null

  const { preferTarget = true } = options
  const text = raw.normalize('NFKC').trim()
  const codes = parseIndustryCodes(text)

  if (codes.length > 0) {
    if (preferTarget) {
      const target = matchTargetFromGepsCodes(codes)
      if (target) return formatIndustryLabel(target)
    }
    return formatGepsCodesLabel(codes)
  }

  const formatted = text.match(FORMATTED_TARGET)
  if (formatted) {
    const existing = findTargetIndustryByCode(formatted[1])
    if (existing && existing.name === formatted[2].trim()) {
      return text
    }
  }

  const keyword = matchTargetIndustry(text)
  if (keyword) return formatIndustryLabel(keyword)

  return text
}

export function classifyIndustryText(
  ...parts: (string | null | undefined)[]
): TargetIndustry | null {
  const combined = parts
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter((p) => p && !isGenericIndustryLabel(p))
    .join(' ')

  if (!combined) return null

  const codes = parseIndustryCodes(combined)
  if (codes.length > 0) {
    return matchTargetFromGepsCodes(codes)
  }

  return matchTargetIndustry(combined)
}

export function isRawIndustryCodes(text: string | null | undefined): boolean {
  if (!text?.trim()) return false
  const t = text.trim()
  if (!/^[\d\s|／/、,.-]+$/.test(t)) return false
  return parseIndustryCodes(t).length > 0
}
