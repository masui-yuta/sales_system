// OpenStreetMap（Geofabrik 地域抽出 .osm.pbf）から電話番号を補完するスクリプト
//
// 【安全方針】
//  - 公共API（Overpass / Nominatim）は一切叩かない。ローカルのPBFファイルのみ解析するので
//    サーバーに負荷をかけず、利用規約・レート制限に抵触しない。
//  - 誤った会社に電話番号を付けないため、社名（正規化）が一致し、かつ
//    候補が一意に絞れる場合のみ補完する（曖昧な一致はスキップ）。
//  - 手動入力済みなど既に電話番号がある会社は上書きしない（phone IS NULL のみ更新）。
//  - OSMデータは ODbL。社内利用（再配布なし）のため、出典表示のみ行えばよい
//    （アプリのフッターに © OpenStreetMap contributors を表示）。
//
// 使い方:
//   1. https://download.geofabrik.de/asia/japan/kinki.html から
//      kinki-latest.osm.pbf（近畿地方）を無料ダウンロードし ./data/ に置く
//   2. node scripts/import-osm-phone.mjs ./data/kinki-latest.osm.pbf [--dry-run]
//
// DB接続は環境変数で上書き可（未設定ならXAMPP既定値）。

import fs from 'node:fs'
import process from 'node:process'
import { Writable } from 'node:stream'
import { finished } from 'node:stream/promises'
import osmParser from 'osm-pbf-parser'
import mysql from 'mysql2/promise'

const CORPORATE_FORMS =
  /(株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|特定非営利活動法人|社会福祉法人|医療法人社団|医療法人財団|医療法人|学校法人|宗教法人|独立行政法人|地方独立行政法人|国立大学法人)/g

function normalizeName(s) {
  if (!s) return ''
  let t = s.normalize('NFKC')
  t = t.replace(CORPORATE_FORMS, '')
  t = t.replace(/[（(]株[）)]|[（(]有[）)]|㈱|㈲/g, '')
  t = t.replace(/\s+/g, '')
  return t.toLowerCase()
}

function normalizeCity(s) {
  return s ? s.normalize('NFKC').replace(/\s+/g, '') : ''
}

// 電話番号を「先頭0始まりの数字列」に正規化（国内固定/携帯 10〜11桁）
function normalizePhone(raw) {
  if (!raw) return null
  let p = String(raw).split(';')[0].normalize('NFKC').trim()
  p = p.replace(/[^\d+]/g, '')
  if (p.startsWith('+81')) p = '0' + p.slice(3)
  p = p.replace(/\D/g, '')
  if (p.length < 10 || p.length > 11) return null
  if (!p.startsWith('0')) return null
  return p
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const file = args.find((a) => !a.startsWith('--'))
  return { file, dryRun: args.includes('--dry-run') }
}

async function main() {
  const { file, dryRun } = parseArgs(process.argv)

  if (!file) {
    console.error(
      'Usage: node scripts/import-osm-phone.mjs <kinki-latest.osm.pbf> [--dry-run]',
    )
    process.exit(1)
  }
  if (!fs.existsSync(file)) {
    console.error(`ファイルが見つかりません: ${file}`)
    process.exit(1)
  }

  const db = await mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sales_system',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
  })

  // phone_source 列が無い既存DBでも動くよう自動追加
  try {
    await db.query(
      'ALTER TABLE companies ADD COLUMN phone_source VARCHAR(30) NULL AFTER phone',
    )
  } catch (e) {
    if (!/duplicate column/i.test(e.message)) throw e
  }

  // 社名→候補（id, city）の索引をメモリに構築
  console.log('企業データを読み込み中...')
  const [rows] = await db.query('SELECT id, name, city FROM companies')
  const byName = new Map()
  for (const r of rows) {
    const nn = normalizeName(r.name)
    if (!nn) continue
    let arr = byName.get(nn)
    if (!arr) {
      arr = []
      byName.set(nn, arr)
    }
    arr.push({ id: r.id, city: r.city })
  }
  console.log(`索引構築完了: ${rows.length.toLocaleString()} 社`)

  const matches = new Map() // companyId -> phone（最初に一致したものを採用）
  let scanned = 0
  let withPhone = 0
  let ambiguous = 0

  const sink = new Writable({
    objectMode: true,
    write(items, _enc, cb) {
      for (const item of items) {
        scanned++
        const tags = item.tags
        if (!tags) continue

        const phoneRaw = tags.phone || tags['contact:phone']
        const name = tags.name || tags['name:ja']
        if (!phoneRaw || !name) continue
        withPhone++

        const phone = normalizePhone(phoneRaw)
        if (!phone) continue

        const nn = normalizeName(name)
        if (!nn) continue

        const cands = byName.get(nn)
        if (!cands || cands.length === 0) continue

        let chosen = null
        if (cands.length === 1) {
          // 関西全体で社名が一意 → 安全に確定
          chosen = cands[0].id
        } else {
          // 複数候補は市区町村で絞る。一意にならなければスキップ
          const cityTok = normalizeCity(tags['addr:city'] || '')
          const subTok = normalizeCity(tags['addr:suburb'] || '')
          let narrowed = cands
          if (cityTok) {
            narrowed = narrowed.filter((c) => {
              const cc = normalizeCity(c.city)
              return cc.includes(cityTok) || cityTok.includes(cc)
            })
          }
          if (subTok) {
            narrowed = narrowed.filter((c) =>
              normalizeCity(c.city).includes(subTok),
            )
          }
          if (narrowed.length === 1) chosen = narrowed[0].id
        }

        if (chosen == null) {
          ambiguous++
          continue
        }
        if (!matches.has(chosen)) matches.set(chosen, phone)
      }
      cb()
    },
  })

  console.log('PBFを解析中...（数分かかる場合があります）')
  fs.createReadStream(file).pipe(osmParser()).pipe(sink)
  await finished(sink)

  console.log(
    `解析完了: 要素 ${scanned.toLocaleString()} / 電話付き ${withPhone.toLocaleString()} / 一致 ${matches.size.toLocaleString()} / 曖昧スキップ ${ambiguous.toLocaleString()}`,
  )

  if (dryRun) {
    console.log('--dry-run のためDBは更新しませんでした。')
    await db.end()
    return
  }

  // 既に電話番号がある会社は上書きしない
  let updated = 0
  const conn = await db.getConnection()
  try {
    await conn.beginTransaction()
    for (const [id, phone] of matches) {
      const [res] = await conn.query(
        'UPDATE companies SET phone = ?, phone_source = ? WHERE id = ? AND phone IS NULL',
        [phone, 'osm', id],
      )
      updated += res.affectedRows || 0
    }
    await conn.commit()
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }

  console.log(`完了: ${updated.toLocaleString()} 件の電話番号を補完しました`)
  await db.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
