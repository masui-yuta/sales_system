// gBizINFO 基本情報 CSV から資本金・従業員数・WebサイトURLを取込
//
//   node scripts/import-gbizinfo-profile.mjs ./data/Kihonjoho_UTF-8.csv
//   node scripts/import-gbizinfo-profile.mjs ./data/Kihonjoho_UTF-8.csv --overwrite

import fs from 'node:fs'
import process from 'node:process'
import { parse } from 'csv-parse'
import iconv from 'iconv-lite'
import { createDbPool } from './db-pool.mjs'

const BATCH_SIZE = 500

function parseArgs(argv) {
  const args = argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  const get = (key) => {
    const hit = args.find((a) => a.startsWith(`--${key}=`))
    return hit ? hit.split('=').slice(1).join('=') : undefined
  }
  return {
    file,
    dryRun: args.includes('--dry-run'),
    overwrite: args.includes('--overwrite'),
    encoding: (get('encoding') || 'utf8').toLowerCase(),
  }
}

function normalizeHeader(h) {
  return String(h ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
}

function findField(record, label) {
  if (label in record) {
    const v = String(record[label] ?? '').trim()
    if (v) return v
  }
  const target = normalizeHeader(label)
  for (const [key, value] of Object.entries(record)) {
    if (normalizeHeader(key) === target) {
      const v = String(value ?? '').trim()
      if (v) return v
    }
  }
  return null
}

function extractCorporateNumber(record) {
  const raw =
    findField(record, '法人番号') ??
    findField(record, 'corporate_number')
  if (!raw) return null
  const n = raw.replace(/\D/g, '')
  return n.length === 13 ? n : null
}

function parseCapitalYen(raw) {
  if (!raw) return null
  const cleaned = raw.replace(/[,，]/g, '').trim()
  if (!cleaned || cleaned === '0') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

function parseEmployeeCount(raw) {
  if (!raw) return null
  const cleaned = raw.replace(/[,，]/g, '').trim()
  if (!cleaned || cleaned === '0') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

function normalizeUrl(raw) {
  const value = String(raw ?? '').trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value.slice(0, 512)
  if (/^www\./i.test(value)) return `https://${value}`.slice(0, 512)
  if (value.includes('.')) return `https://${value}`.slice(0, 512)
  return null
}

function extractProfile(record) {
  const capitalYen = parseCapitalYen(findField(record, '資本金'))
  const employeeCount = parseEmployeeCount(findField(record, '従業員数'))
  const websiteUrl = normalizeUrl(findField(record, 'WebサイトURL'))
  if (capitalYen == null && employeeCount == null && !websiteUrl) return null
  return { capitalYen, employeeCount, websiteUrl }
}

class ProfileStaging {
  constructor(conn, overwrite) {
    this.conn = conn
    this.overwrite = overwrite
    this.inited = false
  }

  async init() {
    if (this.inited) return
    await this.conn.query(`
      CREATE TEMPORARY TABLE gbiz_profile_staging (
        corporate_number CHAR(13) NOT NULL PRIMARY KEY,
        capital_yen BIGINT UNSIGNED NULL,
        employee_count INT UNSIGNED NULL,
        website_url VARCHAR(512) NULL
      )
    `)
    this.inited = true
  }

  async flush(batch, dryRun) {
    if (batch.length === 0) return 0
    if (dryRun) return batch.length

    await this.init()
    await this.conn.query('TRUNCATE TABLE gbiz_profile_staging')

    const placeholders = batch.map(() => '(?,?,?,?)').join(',')
    const values = batch.flatMap((r) => [
      r.corporateNumber,
      r.capitalYen,
      r.employeeCount,
      r.websiteUrl,
    ])
    await this.conn.query(
      `INSERT INTO gbiz_profile_staging
         (corporate_number, capital_yen, employee_count, website_url)
       VALUES ${placeholders}`,
      values,
    )

    const setSql = this.overwrite
      ? `c.capital_yen = g.capital_yen,
         c.employee_count = g.employee_count,
         c.website_url = g.website_url`
      : `c.capital_yen = COALESCE(c.capital_yen, g.capital_yen),
         c.employee_count = COALESCE(c.employee_count, g.employee_count),
         c.website_url = COALESCE(c.website_url, g.website_url)`

    const [res] = await this.conn.query(`
      UPDATE companies c
      INNER JOIN gbiz_profile_staging g ON g.corporate_number = c.corporate_number
      SET ${setSql}
    `)

    return res.affectedRows ?? 0
  }
}

async function loadDbCorporateNumbers(conn) {
  const [rows] = await conn.query('SELECT corporate_number FROM companies')
  const set = new Set()
  for (const r of rows) {
    const n = String(r.corporate_number ?? '').replace(/\D/g, '')
    if (n.length === 13) set.add(n)
  }
  return set
}

async function importFromCsv(conn, file, opts, inDb) {
  const staging = new ProfileStaging(conn, opts.overwrite)

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
  let skippedNotInDb = 0
  let skippedNoProfile = 0

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

    const profile = extractProfile(row)
    if (!profile) {
      skippedNoProfile++
      continue
    }

    batch.push({
      corporateNumber,
      capitalYen: profile.capitalYen,
      employeeCount: profile.employeeCount,
      websiteUrl: profile.websiteUrl,
    })
    matched++

    if (batch.length >= BATCH_SIZE) {
      updated += await staging.flush(batch, opts.dryRun)
      batch = []
    }
  }

  updated += await staging.flush(batch, opts.dryRun)

  return { read, matched, updated, skippedNoProfile, skippedNotInDb }
}

async function main() {
  const opts = parseArgs(process.argv)
  if (!opts.file) {
    console.error('Usage: node scripts/import-gbizinfo-profile.mjs <file.csv> [--overwrite] [--dry-run]')
    process.exit(1)
  }
  if (!fs.existsSync(opts.file)) {
    console.error(`ファイルが見つかりません: ${opts.file}`)
    process.exit(1)
  }

  const pool = createDbPool({ connectionLimit: 1 })
  const conn = await pool.getConnection()

  try {
    console.log('DB内の法人番号を読み込み中…')
    const inDb = await loadDbCorporateNumbers(conn)
    console.log(`DB登録: ${inDb.size.toLocaleString()} 社`)

    const result = await importFromCsv(conn, opts.file, opts, inDb)
    console.log(
      `完了: 読込 ${result.read.toLocaleString()} 行 / プロフィールあり ${result.matched.toLocaleString()} / DB更新 ${result.updated.toLocaleString()} / データなし ${result.skippedNoProfile.toLocaleString()} / DB外 ${result.skippedNotInDb.toLocaleString()}`,
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
