// gBizINFO（経産省）から業種（業品目等）を補完するスクリプト
//
// 【安全方針】
//  - 公式の「データダウンロード」CSV/JSON、または申請済み REST API のみ使用（スクレイピング禁止）
//  - 自社DB内の companies と法人番号で JOIN するだけ（再配布しない）
//  - 手動入力済みの industry は既定では上書きしない
//  - API 利用時はリクエスト間隔を空け、短時間の大量アクセスを避ける
//
// 事前準備（CSV・推奨）:
//   1. https://info.gbiz.go.jp/ → ダウンロード → 法人基本情報等を CSV/JSON で取得
//   2. node scripts/import-gbizinfo.mjs ./data/gbizinfo.csv
//
// API（差分・少量向け）:
//   1. https://content.info.gbiz.go.jp/api/index.html で利用申請 → トークン取得
//   2. $env:GBIZINFO_API_TOKEN="取得したトークン"
//   3. node scripts/import-gbizinfo.mjs --api [--limit=500] [--delay-ms=300]

import fs from 'node:fs'
import process from 'node:process'
import { createDbPool } from './db-pool.mjs'
import { parse } from 'csv-parse'
import iconv from 'iconv-lite'
import {
  classifyIndustryText,
  formatIndustryLabel,
  resolveIndustryLabel,
  isGenericIndustryLabel,
} from '../lib/target-industries.mjs'

const BATCH_SIZE = 500
const API_BASE = 'https://info.gbiz.go.jp/hojin/v2/hojin'
const MAX_INDUSTRY_LEN = 255

const CORPORATE_NUMBER_KEYS = [
  'corporate_number',
  '法人番号',
  'corporatenumber',
  'hojin_bango',
]

const INDUSTRY_TEXT_KEYS = [
  '事業概要',
  'business_summary',
  '事業種目',
  'business_items',
  '全省庁統一資格-営業品目',
  '営業品目',
  '取扱営業品目',
  '業品目',
]

function parseArgs(argv) {
  const args = argv.slice(2)
  const get = (key) => {
    const hit = args.find((a) => a.startsWith(`--${key}=`))
    return hit ? hit.split('=').slice(1).join('=') : undefined
  }
  const file = args.find((a) => !a.startsWith('--'))
  return {
    file,
    api: args.includes('--api'),
    dryRun: args.includes('--dry-run'),
    overwrite: args.includes('--overwrite'),
    encoding: (get('encoding') || 'utf8').toLowerCase(),
    limit: Math.max(Number(get('limit') ?? '0') || 0, 0),
    delayMs: Math.max(Number(get('delay-ms') ?? '300') || 300, 100),
    targetOnly: !args.includes('--all'),
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeHeader(h) {
  return String(h ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function parseIndustryValue(raw) {
  if (raw == null) return null

  if (Array.isArray(raw)) {
    const items = raw.map((v) => String(v).trim()).filter(Boolean)
    return items.length ? items.join(' / ').slice(0, MAX_INDUSTRY_LEN) : null
  }

  const text = String(raw).trim()
  if (!text || text === '-' || text === 'null') return null

  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        const items = parsed.map((v) => String(v).trim()).filter(Boolean)
        return items.length ? items.join(' / ').slice(0, MAX_INDUSTRY_LEN) : null
      }
    } catch {
      // fall through
    }
  }

  const parts = text
    .split(/[|;／/、,]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length > 1) {
    return parts.join(' / ').slice(0, MAX_INDUSTRY_LEN)
  }

  return text.slice(0, MAX_INDUSTRY_LEN)
}

function collectIndustryTexts(record) {
  if (!record || typeof record !== 'object') return []

  const texts = []
  const seen = new Set()

  const push = (raw) => {
    const v = parseIndustryValue(raw)
    if (!v || isGenericIndustryLabel(v) || seen.has(v)) return
    seen.add(v)
    texts.push(v)
  }

  for (const key of INDUSTRY_TEXT_KEYS) {
    if (key in record) push(record[key])
  }

  for (const [key, value] of Object.entries(record)) {
    const k = normalizeHeader(key)
    if (
      k.includes('事業概要') ||
      k.includes('業品目') ||
      k.includes('営業品目') ||
      k === '業種' ||
      k.includes('業種名')
    ) {
      push(value)
    }
  }

  return texts
}

/** gBizINFOの営業品目コード・事業概要を変換 */
function resolveIndustryFromRecord(record, opts) {
  const texts = collectIndustryTexts(record)
  if (texts.length === 0) return null

  if (opts.targetOnly) {
    const target = classifyIndustryText(...texts)
    if (target) {
      return formatIndustryLabel(target).slice(0, MAX_INDUSTRY_LEN)
    }
    return null
  }

  const label = resolveIndustryLabel(texts.join(' / '))
  return label ? label.slice(0, MAX_INDUSTRY_LEN) : null
}

function extractIndustryFromRecord(record, opts = { targetOnly: true }) {
  return resolveIndustryFromRecord(record, opts)
}

function extractCorporateNumber(record) {
  if (!record || typeof record !== 'object') return null

  for (const key of CORPORATE_NUMBER_KEYS) {
    if (key in record) {
      const n = String(record[key] ?? '').replace(/\D/g, '')
      if (n.length === 13) return n
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (normalizeHeader(key).includes('法人番号')) {
      const n = String(value ?? '').replace(/\D/g, '')
      if (n.length === 13) return n
    }
  }

  return null
}

async function ensureIndustryColumn(conn) {
  const [rows] = await conn.query(
    `SELECT CHARACTER_MAXIMUM_LENGTH AS len
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'companies'
       AND COLUMN_NAME = 'industry'`,
  )
  const len = Number(rows[0]?.len ?? 50)
  if (len < MAX_INDUSTRY_LEN) {
    console.log(
      `industry 列を拡張中（VARCHAR(${len}) → VARCHAR(${MAX_INDUSTRY_LEN})）… 42万件超だと数分かかります`,
    )
    await conn.query(
      `ALTER TABLE companies MODIFY industry VARCHAR(${MAX_INDUSTRY_LEN}) NULL`,
    )
    console.log('industry 列の拡張が完了しました')
  }
}

async function loadDbCorporateNumbers(conn) {
  const [rows] = await conn.query(
    'SELECT corporate_number FROM companies',
  )
  const set = new Set()
  for (const r of rows) {
    const n = String(r.corporate_number ?? '').replace(/\D/g, '')
    if (n.length === 13) set.add(n)
  }
  return set
}

/** 同一接続上で TEMPORARY TABLE を使うバッチ更新 */
class IndustryStaging {
  constructor(conn, overwrite) {
    this.conn = conn
    this.overwrite = overwrite
    this.inited = false
  }

  async init() {
    if (this.inited) return
    await this.conn.query(`
      CREATE TEMPORARY TABLE gbiz_industry_staging (
        corporate_number CHAR(13) NOT NULL PRIMARY KEY,
        industry VARCHAR(255) NOT NULL
      )
    `)
    this.inited = true
  }

  async flush(batch, dryRun) {
    if (batch.length === 0) return 0
    if (dryRun) return batch.length

    await this.init()
    await this.conn.query('TRUNCATE TABLE gbiz_industry_staging')

    const placeholders = batch.map(() => '(?,?)').join(',')
    const values = batch.flatMap((r) => [r.corporateNumber, r.industry])
    await this.conn.query(
      `INSERT INTO gbiz_industry_staging (corporate_number, industry) VALUES ${placeholders}`,
      values,
    )

    const whereExtra = this.overwrite
      ? ''
      : "AND (c.industry IS NULL OR c.industry = '')"

    const [res] = await this.conn.query(`
      UPDATE companies c
      INNER JOIN gbiz_industry_staging g ON g.corporate_number = c.corporate_number
      SET c.industry = g.industry
      WHERE 1=1 ${whereExtra}
    `)

    return res.affectedRows ?? 0
  }
}

async function importFromCsv(conn, file, opts, inDb) {
  const staging = new IndustryStaging(conn, opts.overwrite)

  let readStream = fs.createReadStream(file)
  if (opts.encoding === 'sjis' || opts.encoding === 'shift_jis') {
    readStream = readStream.pipe(iconv.decodeStream('Shift_JIS'))
  } else {
    readStream.setEncoding('utf8')
  }

  const parser = readStream.pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
    }),
  )

  let batch = []
  let read = 0
  let matched = 0
  let updated = 0
  let skippedNoIndustry = 0
  let skippedNotInDb = 0

  for await (const row of parser) {
    read++
    if (read % 50000 === 0) {
      console.log(`...CSV ${read.toLocaleString()} 行読込（更新 ${updated}）`)
    }

    const corporateNumber = extractCorporateNumber(row)
    if (!corporateNumber) continue
    if (!inDb.has(corporateNumber)) {
      skippedNotInDb++
      continue
    }

    const industry = extractIndustryFromRecord(row, opts)
    if (!industry) {
      skippedNoIndustry++
      continue
    }

    batch.push({ corporateNumber, industry })
    matched++

    if (batch.length >= BATCH_SIZE) {
      const n = await staging.flush(batch, opts.dryRun)
      updated += n
      batch = []
      if (matched % 2000 === 0) {
        console.log(`...業種あり ${matched.toLocaleString()} 件（DB更新 ${updated}）`)
      }
    }
  }

  updated += await staging.flush(batch, opts.dryRun)

  return { read, matched, updated, skippedNoIndustry, skippedNotInDb }
}

async function importFromJson(conn, file, opts, inDb) {
  const staging = new IndustryStaging(conn, opts.overwrite)

  console.log('JSON を読み込み中…')
  const raw = fs.readFileSync(file, 'utf8')
  const data = JSON.parse(raw)
  const records = Array.isArray(data)
    ? data
    : Array.isArray(data['hojin-infos'])
      ? data['hojin-infos']
      : Array.isArray(data.hojinInfos)
        ? data.hojinInfos
        : []

  if (records.length === 0) {
    throw new Error(
      'JSONに hojin-infos 配列が見つかりません。gBizINFO公式ダウンロード形式か確認してください。',
    )
  }

  let batch = []
  let read = records.length
  let matched = 0
  let updated = 0
  let skippedNoIndustry = 0
  let skippedNotInDb = 0

  for (const row of records) {
    const corporateNumber = extractCorporateNumber(row)
    if (!corporateNumber) continue
    if (!inDb.has(corporateNumber)) {
      skippedNotInDb++
      continue
    }

    const industry = extractIndustryFromRecord(row, opts)
    if (!industry) {
      skippedNoIndustry++
      continue
    }

    batch.push({ corporateNumber, industry })
    matched++

    if (batch.length >= BATCH_SIZE) {
      updated += await staging.flush(batch, opts.dryRun)
      batch = []
    }
  }

  updated += await staging.flush(batch, opts.dryRun)
  return { read, matched, updated, skippedNoIndustry, skippedNotInDb }
}

async function fetchGbizIndustry(token, corporateNumber) {
  const res = await fetch(`${API_BASE}/${corporateNumber}`, {
    headers: {
      Accept: 'application/json',
      'X-hojinInfo-api-token': token,
    },
  })

  if (res.status === 404) return null
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  const info = data['hojin-infos']?.[0]
  if (!info) return null
  return extractIndustryFromRecord(info, { targetOnly: true })
}

async function importFromApi(conn, opts) {
  const token = process.env.GBIZINFO_API_TOKEN?.trim()
  if (!token) {
    console.error(
      'GBIZINFO_API_TOKEN が未設定です。\n' +
        '  https://content.info.gbiz.go.jp/api/index.html で利用申請後、\n' +
        '  PowerShell: $env:GBIZINFO_API_TOKEN="取得したトークン"',
    )
    process.exit(1)
  }

  const limitSql = opts.limit > 0 ? `LIMIT ${opts.limit}` : ''
  const overwriteSql = opts.overwrite
    ? ''
    : "AND (industry IS NULL OR industry = '')"

  const [rows] = await conn.query(
    `SELECT corporate_number FROM companies WHERE corporate_number IS NOT NULL ${overwriteSql} ORDER BY id ${limitSql}`,
  )

  console.log(`API照会対象: ${rows.length.toLocaleString()} 件（--limit で絞れます）`)

  let queried = 0
  let withIndustry = 0
  let updated = 0
  let notFound = 0
  let errors = 0

  for (const row of rows) {
    const corporateNumber = String(row.corporate_number).replace(/\D/g, '')
    if (corporateNumber.length !== 13) continue

    queried++
    try {
      const industry = await fetchGbizIndustry(token, corporateNumber)
      if (!industry) {
        notFound++
      } else {
        withIndustry++
        if (!opts.dryRun) {
          const whereOverwrite = opts.overwrite
            ? 'corporate_number = ?'
            : "corporate_number = ? AND (industry IS NULL OR industry = '')"
          const [res] = await conn.query(
            `UPDATE companies SET industry = ? WHERE ${whereOverwrite}`,
            [industry, corporateNumber],
          )
          updated += res.affectedRows ?? 0
        } else {
          updated++
        }
      }
    } catch (e) {
      errors++
      if (errors <= 3) {
        console.error(`  APIエラー (${corporateNumber}):`, e.message)
      }
      if (errors === 3) console.error('  （以降のAPIエラーは省略）')
    }

    if (queried % 100 === 0) {
      console.log(
        `...${queried}/${rows.length} 件照会（業種あり ${withIndustry} / 更新 ${updated}）`,
      )
    }

    await sleep(opts.delayMs)
  }

  return { queried, withIndustry, updated, notFound, errors }
}

async function main() {
  const opts = parseArgs(process.argv)

  if (!opts.api && !opts.file) {
    console.error(`gBizINFO 業種取込

CSV/JSON（一括・推奨）:
  node scripts/import-gbizinfo.mjs <file.csv|file.json> [--encoding=utf8|sjis] [--overwrite] [--dry-run] [--all]

  既定では gBizINFO の全省庁統一資格・営業品目を営業対象の日本標準産業分類に変換して保存します。
  --all を付けると、営業対象外も GEPS 名称付きで保存します。

  1. https://info.gbiz.go.jp/ → ダウンロード → 法人基本情報 CSV/JSON を ./data/ に保存
  2. 上記コマンドで実行

API（差分・少量向け。42万件全件は数日かかるため非推奨）:
  node scripts/import-gbizinfo.mjs --api --limit=500 [--delay-ms=300]

  環境変数 GBIZINFO_API_TOKEN に公式申請で取得したトークンを設定`)
    process.exit(1)
  }

  if (opts.file && !fs.existsSync(opts.file)) {
    console.error(`ファイルが見つかりません: ${opts.file}`)
    process.exit(1)
  }

  const pool = createDbPool({ connectionLimit: 1 })
  const conn = await pool.getConnection()

  try {
    await ensureIndustryColumn(conn)

    if (opts.api) {
      console.log('gBizINFO API モード（公式 REST API v2）')
      if (opts.dryRun) console.log('（dry-run: DBは更新しません）')
      const stats = await importFromApi(conn, opts)
      console.log(
        `完了: 照会 ${stats.queried} / 業種取得 ${stats.withIndustry} / DB更新 ${stats.updated} / 業種なし ${stats.notFound} / エラー ${stats.errors}`,
      )
      return
    }

    console.log('DB内の法人番号を読み込み中…')
    const inDb = await loadDbCorporateNumbers(conn)
    console.log(`DB登録: ${inDb.size.toLocaleString()} 社（この法人番号だけ更新対象）`)

    const lower = opts.file.toLowerCase()
    const isJson = lower.endsWith('.json')

    console.log(`gBizINFO ${isJson ? 'JSON' : 'CSV'} モード: ${opts.file}`)
    if (opts.targetOnly) {
      console.log('営業対象業種への変換モード（GEPS→日本標準産業分類）')
    } else {
      console.log('全件ラベル付与モード（--all）')
    }
    if (opts.dryRun) console.log('（dry-run: DBは更新しません）')

    const stats = isJson
      ? await importFromJson(conn, opts.file, opts, inDb)
      : await importFromCsv(conn, opts.file, opts, inDb)

    console.log(
      `完了: 読込 ${stats.read.toLocaleString()} 行 / 業種あり ${stats.matched.toLocaleString()} / DB更新 ${stats.updated.toLocaleString()} / 業種なし ${stats.skippedNoIndustry.toLocaleString()} / DB外スキップ ${stats.skippedNotInDb.toLocaleString()}`,
    )
    console.log(
      '※ gBizINFOに業種が無い法人は更新されません（全社カバーではないため）',
    )
  } finally {
    conn.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
