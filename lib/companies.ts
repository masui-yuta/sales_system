import type { RowDataPacket } from 'mysql2'
import { db } from './db'
import { findTargetIndustryByCode } from './target-industries'

export type { TargetIndustry } from './target-industries'
export { TARGET_INDUSTRIES } from './target-industries'

export type Company = {
  id: number
  corporate_number: string
  name: string
  prefecture: string
  city: string
  address: string
  post_code: string | null
  phone: string | null
  industry: string | null
  capital_yen: number | null
  employee_count: number | null
  website_url: string | null
  recruit_url: string | null
  source: string | null
  note: string | null
  call_count: number
}

export type CompanyListItem = Pick<
  Company,
  'id' | 'name' | 'prefecture' | 'city' | 'phone' | 'industry' | 'call_count'
>

export type CallLog = {
  id: number
  company_id: number
  called_at: string
  result: string
  memo: string | null
}

export type CompanyCursor = {
  name: string
  id: number
}

export type CompanyFilter = {
  prefecture?: string
  city?: string
  q?: string
  industry?: string
  uncalled?: boolean
  hasPhone?: boolean
  hasIndustry?: boolean
  after?: CompanyCursor
  pageSize?: number
}

export type CompanyListResult = {
  companies: CompanyListItem[]
  nextAfter: CompanyCursor | null
}

export const KANSAI_PREFECTURES = [
  '大阪府',
  '京都府',
  '兵庫県',
  '奈良県',
  '滋賀県',
  '和歌山県',
]

/** データが1府県のみの環境でも全件スキャンしないよう既定値を付ける */
export const DEFAULT_PREFECTURE = '大阪府'

export const CALL_RESULTS = [
  '不在',
  '担当者不在',
  '受付ブロック',
  '資料送付',
  'アポ獲得',
  '断り',
  '見込みあり',
]

function buildWhere(filter: CompanyFilter) {
  const where: string[] = []
  const params: (string | number)[] = []

  if (filter.prefecture) {
    where.push('c.prefecture = ?')
    params.push(filter.prefecture.trim())
  }
  if (filter.city) {
    where.push('c.city = ?')
    params.push(filter.city.trim())
  }
  if (filter.q) {
    where.push('(c.name LIKE ? OR c.address LIKE ?)')
    params.push(`%${filter.q.trim()}%`, `%${filter.q.trim()}%`)
  }
  if (filter.industry) {
    const code = filter.industry.trim()
    const item = findTargetIndustryByCode(code)
    if (item) {
      where.push('(c.industry = ? OR c.industry LIKE ?)')
      params.push(`${item.code} ${item.name}`, `${item.code} %`)
    } else {
      where.push('c.industry LIKE ?')
      params.push(`%${code}%`)
    }
  }
  if (filter.hasPhone) {
    where.push("c.phone IS NOT NULL AND c.phone <> ''")
  }
  if (filter.hasIndustry) {
    where.push("c.industry IS NOT NULL AND c.industry <> ''")
  }
  if (filter.uncalled) {
    where.push('c.call_count = 0')
  }
  if (filter.after) {
    where.push('(c.name > ? OR (c.name = ? AND c.id > ?))')
    params.push(filter.after.name, filter.after.name, filter.after.id)
  }

  return {
    sql: where.length ? `WHERE ${where.join(' AND ')}` : '',
    params,
  }
}

export type DbStats = {
  total: number
  with_phone: number
  uncalled: number
}

export async function getDbStats(prefecture?: string): Promise<DbStats> {
  const where = prefecture ? 'WHERE prefecture = ?' : ''
  const params = prefecture ? [prefecture.trim()] : []
  const sql = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN phone IS NOT NULL AND phone <> '' THEN 1 ELSE 0 END) AS with_phone,
      SUM(CASE WHEN call_count = 0 THEN 1 ELSE 0 END) AS uncalled
    FROM companies
    ${where}
  `
  const [rows] = await db.query<RowDataPacket[]>(sql, params)
  const row = rows[0]
  return {
    total: Number(row?.total ?? 0),
    with_phone: Number(row?.with_phone ?? 0),
    uncalled: Number(row?.uncalled ?? 0),
  }
}

/** LIMIT 50 のみ取得（OFFSET 不使用・カーソルページング） */
export async function getCompanies(
  filter: CompanyFilter,
): Promise<CompanyListResult> {
  const { sql: whereSql, params } = buildWhere(filter)

  const pageSize = Math.min(Math.max(filter.pageSize ?? 50, 1), 200)
  const fetchSize = pageSize + 1

  const sql = `
    SELECT
      c.id, c.name, c.prefecture, c.city, c.phone, c.industry, c.call_count
    FROM companies c
    ${whereSql}
    ORDER BY c.name ASC, c.id ASC
    LIMIT ${fetchSize}
  `

  const [rows] = await db.query<RowDataPacket[]>(sql, params)
  const all = rows as unknown as CompanyListItem[]
  const hasMore = all.length > pageSize
  const companies = hasMore ? all.slice(0, pageSize) : all
  const last = companies[companies.length - 1]

  return {
    companies,
    nextAfter:
      hasMore && last ? { name: last.name, id: last.id } : null,
  }
}

export async function countCompanies(filter: CompanyFilter): Promise<number> {
  const { sql: whereSql, params } = buildWhere(filter)

  const sql = `
    SELECT COUNT(*) AS total
    FROM companies c
    ${whereSql}
  `

  const [rows] = await db.query<RowDataPacket[]>(sql, params)
  return Number(rows[0]?.total ?? 0)
}

/** 市区町村・キーワード・業種で十分絞れたときだけ COUNT（42万件の COUNT は10秒超） */
export function needsExactCount(filter: CompanyFilter): boolean {
  return Boolean(filter.city || filter.q || filter.industry)
}

export async function getCities(
  prefecture: string,
): Promise<{ city: string; total: number; uncalled: number }[]> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT city, total, uncalled
     FROM city_stats
     WHERE prefecture = ?
     ORDER BY uncalled DESC, city ASC`,
    [prefecture.trim()],
  )

  if (rows.length > 0) {
    return rows as unknown as { city: string; total: number; uncalled: number }[]
  }

  // city_stats 未作成時のフォールバック（初回 migrate 前）
  const [fallback] = await db.query<RowDataPacket[]>(
    `SELECT
       city,
       COUNT(*) AS total,
       SUM(call_count = 0) AS uncalled
     FROM companies
     WHERE prefecture = ?
     GROUP BY city
     ORDER BY uncalled DESC, city ASC`,
    [prefecture.trim()],
  )
  return fallback as unknown as { city: string; total: number; uncalled: number }[]
}

export async function getCompanyById(id: number): Promise<Company | null> {
  const sql = `
    SELECT
      id, corporate_number, name, prefecture, city, address,
      post_code, phone, industry, capital_yen, employee_count,
      website_url, recruit_url, source, note, call_count
    FROM companies
    WHERE id = ?
    LIMIT 1
  `
  const [rows] = await db.query<RowDataPacket[]>(sql, [id])
  return (rows[0] as unknown as Company) ?? null
}

export async function getCallLogs(companyId: number): Promise<CallLog[]> {
  const sql = `
    SELECT id, company_id, called_at, result, memo
    FROM call_logs
    WHERE company_id = ?
    ORDER BY called_at DESC
  `
  const [rows] = await db.query<RowDataPacket[]>(sql, [companyId])
  return rows as unknown as CallLog[]
}

export function parseCompanyCursor(
  raw: string | undefined,
): CompanyCursor | undefined {
  if (!raw) return undefined
  const idx = raw.lastIndexOf(':')
  if (idx <= 0) return undefined
  const name = decodeURIComponent(raw.slice(0, idx))
  const id = Number(raw.slice(idx + 1))
  if (!name || !Number.isFinite(id)) return undefined
  return { name, id }
}

export function formatCompanyCursor(cursor: CompanyCursor): string {
  return `${encodeURIComponent(cursor.name)}:${cursor.id}`
}
