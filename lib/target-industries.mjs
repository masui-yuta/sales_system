import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const TARGET_INDUSTRIES = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'target-industries.json'), 'utf8'),
)
export const GEPS_ITEMS = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'geps-items.json'), 'utf8'),
)
export const GEPS_TO_TARGET = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'geps-to-target.json'), 'utf8'),
)

const GENERIC_LABEL = /^[A-Z]:[^:]{1,30}$/
const GENERIC_GRADE = /^[A-Z]\|+\|*$/
const FORMATTED_TARGET = /^(\d{3})\s+(.+)$/

/** gBizINFO の粗い分類（E:製造業 等）は変換対象外 */
export function isGenericIndustryLabel(text) {
  const t = String(text ?? '').trim()
  if (!t) return true
  return GENERIC_LABEL.test(t) || GENERIC_GRADE.test(t)
}

/** 215|219 / 215 / 219 などから3桁コードを抽出 */
export function parseIndustryCodes(raw) {
  if (!raw?.trim()) return []

  const seen = new Set()
  const codes = []

  for (const part of raw.normalize('NFKC').split(/[|／/、,\s]+/)) {
    const c = part.trim()
    if (/^\d{3}$/.test(c) && !seen.has(c)) {
      seen.add(c)
      codes.push(c)
    }
  }

  return codes
}

function compilePattern(source) {
  return new RegExp(source, 'i')
}

function isSteelMaintenanceContext(text) {
  return /メンテナンス|保守工事|プラント.*設計|建設業|土木工事|設備工事/.test(text)
}

export function matchTargetIndustry(raw) {
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

export function findTargetIndustryByCode(code) {
  if (!code?.trim()) return undefined
  return TARGET_INDUSTRIES.find((i) => i.code === code.trim())
}

/** 全省庁統一資格コード → 営業対象の日本標準産業分類 */
export function matchTargetFromGepsCodes(codes) {
  for (const target of TARGET_INDUSTRIES) {
    for (const code of codes) {
      if (GEPS_TO_TARGET[code] === target.code) {
        return target
      }
    }
  }
  return null
}

export function formatIndustryLabel(item) {
  return `${item.code} ${item.name}`
}

export function formatGepsCodesLabel(codes) {
  return codes
    .map((code) => {
      const name = GEPS_ITEMS[code]
      return name ? `${code} ${name}` : `${code}（名称未登録）`
    })
    .join(' / ')
}

/**
 * gBizINFOの営業品目コード・事業概要テキストを表示用ラベルへ変換。
 * 営業対象の日本標準産業分類に該当すればそのラベルを優先する。
 */
export function resolveIndustryLabel(raw, { preferTarget = true } = {}) {
  if (!raw?.trim()) return null

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

export function classifyIndustryText(...parts) {
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

/** 営業品目コードのみ（数字と区切り）か */
export function isRawIndustryCodes(text) {
  if (!text?.trim()) return false
  const t = text.trim()
  if (!/^[\d\s|／/、,.-]+$/.test(t)) return false
  return parseIndustryCodes(t).length > 0
}
