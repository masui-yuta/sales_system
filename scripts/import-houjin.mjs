// 国税庁 法人番号データ（全件 / 都道府県別CSV）取込スクリプト
//
// 国税庁の公表データに含まれるのは「法人番号・社名・所在地」のみ。
// 電話番号・業種は空（NULL）で投入され、STEP2（OpenStreetMap / 手動 / CSV）で補完する。
//
// 使い方:
//   1. 先に db/schema.sql を実行してDBを作成
//   2. 国税庁サイトから関西の都道府県別CSVをダウンロード
//      https://www.houjin-bangou.nta.go.jp/download/
//   3. 実行:
//      node scripts/import-houjin.mjs <CSVファイルパス> [--encoding=sjis|utf8] [--prefectures=大阪府,京都府]
//
//   例: node scripts/import-houjin.mjs ./data/27_osaka.csv
//
// DB接続は環境変数で上書き可（未設定ならXAMPP既定値）:
//   DB_HOST(127.0.0.1) DB_PORT(3306) DB_USER(root) DB_PASSWORD('') DB_NAME(sales_system)

import fs from 'node:fs'
import process from 'node:process'
import { createDbPool } from './db-pool.mjs'
import { parse } from 'csv-parse'
import iconv from 'iconv-lite'

// 関西6府県（既定の取込対象）
const KANSAI = new Set(['大阪府', '京都府', '兵庫県', '奈良県', '滋賀県', '和歌山県'])

// 国税庁CSV（ヘッダ無し・30列）の列インデックス（0始まり）
// 仕様変更があった場合はここだけ直せばよい
const COL = {
  corporateNumber: 1, // 法人番号
  name: 6, // 商号又は名称
  prefecture: 9, // 国内所在地（都道府県）
  city: 10, // 国内所在地（市区町村）
  street: 11, // 国内所在地（丁目番地等）
  postCode: 15, // 郵便番号
  closeCause: 19, // 登記記録の閉鎖等の事由（値があれば廃業等なので除外）
  latest: 23, // 最新履歴（0=過去履歴なので除外）
}

const BATCH_SIZE = 1000

function parseArgs(argv) {
  const args = argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  const get = (key) => {
    const hit = args.find((a) => a.startsWith(`--${key}=`))
    return hit ? hit.split('=').slice(1).join('=') : undefined
  }
  return {
    file,
    encoding: (get('encoding') || 'sjis').toLowerCase(),
    prefectures: get('prefectures'),
  }
}

async function main() {
  const { file, encoding, prefectures } = parseArgs(process.argv)

  if (!file) {
    console.error(
      'Usage: node scripts/import-houjin.mjs <csv-file> [--encoding=sjis|utf8] [--prefectures=大阪府,京都府]',
    )
    process.exit(1)
  }
  if (!fs.existsSync(file)) {
    console.error(`ファイルが見つかりません: ${file}`)
    process.exit(1)
  }

  const targetPrefs = prefectures
    ? new Set(prefectures.split(',').map((s) => s.trim()))
    : KANSAI

  const db = createDbPool({ connectionLimit: 5 })

  let readStream = fs.createReadStream(file)
  if (encoding === 'utf8') {
    readStream.setEncoding('utf8')
  } else {
    readStream = readStream.pipe(iconv.decodeStream('Shift_JIS'))
  }

  const parser = readStream.pipe(
    parse({ relax_column_count: true, skip_empty_lines: true, bom: true }),
  )

  let batch = []
  let total = 0
  let inserted = 0
  let skipped = 0

  const flush = async () => {
    if (batch.length === 0) return
    const placeholders = batch.map(() => '(?,?,?,?,?,?,?)').join(',')
    const values = []
    for (const r of batch) {
      values.push(r.corporateNumber, r.name, r.prefecture, r.city, r.address, r.postCode, 'kokuzeicho')
    }
    const sql =
      `INSERT INTO companies (corporate_number, name, prefecture, city, address, post_code, source) VALUES ${placeholders} ` +
      `ON DUPLICATE KEY UPDATE name=VALUES(name), prefecture=VALUES(prefecture), city=VALUES(city), address=VALUES(address), post_code=VALUES(post_code)`
    await db.query(sql, values)
    inserted += batch.length
    batch = []
  }

  for await (const row of parser) {
    total++

    if (row[COL.latest] === '0') {
      skipped++
      continue
    }
    const closeCause = (row[COL.closeCause] || '').trim()
    if (closeCause !== '') {
      skipped++
      continue
    }
    const prefecture = (row[COL.prefecture] || '').trim()
    if (!targetPrefs.has(prefecture)) {
      skipped++
      continue
    }
    const corporateNumber = (row[COL.corporateNumber] || '').trim()
    if (!corporateNumber) {
      skipped++
      continue
    }

    const city = (row[COL.city] || '').trim()
    const street = (row[COL.street] || '').trim()
    batch.push({
      corporateNumber,
      name: (row[COL.name] || '').trim(),
      prefecture,
      city,
      address: prefecture + city + street,
      postCode: (row[COL.postCode] || '').trim() || null,
    })

    if (batch.length >= BATCH_SIZE) {
      await flush()
      if (inserted % 10000 === 0) console.log(`...${inserted} 件取込済み`)
    }
  }
  await flush()

  console.log(`完了: 読込 ${total} 行 / 取込 ${inserted} 件 / スキップ ${skipped} 件`)
  await db.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
