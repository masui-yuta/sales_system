// 既存の industry 列を表示用ラベルへ変換
// gBizINFOの営業品目コード（215|219|303…）に対応
//
//   node scripts/normalize-industry.mjs [--dry-run] [--overwrite]

import { createDbPool } from './db-pool.mjs'
import {
  resolveIndustryLabel,
  isRawIndustryCodes,
} from '../lib/target-industries.mjs'

const BATCH = 1000

function parseArgs(argv) {
  const args = argv.slice(2)
  return {
    dryRun: args.includes('--dry-run'),
    overwrite: args.includes('--overwrite'),
  }
}

async function main() {
  const opts = parseArgs(process.argv)
  const pool = createDbPool({ connectionLimit: 1 })

  const conn = await pool.getConnection()
  let lastId = 0
  let scanned = 0
  let updated = 0

  try {
    while (true) {
      const [rows] = await conn.query(
        `SELECT id, industry FROM companies
         WHERE id > ? AND industry IS NOT NULL AND industry <> ''
         ORDER BY id LIMIT ${BATCH}`,
        [lastId],
      )
      if (rows.length === 0) break

      for (const row of rows) {
        scanned++
        lastId = row.id

        const label = resolveIndustryLabel(row.industry)
        if (!label || label === row.industry) continue

        const isRaw = isRawIndustryCodes(row.industry)
        if (!isRaw && !opts.overwrite) continue

        if (!opts.dryRun) {
          await conn.query('UPDATE companies SET industry = ? WHERE id = ?', [
            label.slice(0, 255),
            row.id,
          ])
        }
        updated++
      }

      if (scanned % 10000 === 0) {
        console.log(`...${scanned.toLocaleString()} 件走査（更新 ${updated}）`)
      }
    }

    console.log(
      `完了: 走査 ${scanned.toLocaleString()} / 更新 ${updated.toLocaleString()}${opts.dryRun ? '（dry-run）' : ''}`,
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
