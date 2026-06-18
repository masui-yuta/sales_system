// 架電回数を companies.call_count に保持して一覧を高速化（1回だけ実行）
import mysql from 'mysql2/promise'

const db = await mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sales_system',
  charset: 'utf8mb4',
  connectionLimit: 1,
})

try {
  console.log('call_count 列を追加中…')
  try {
    await db.query(
      'ALTER TABLE companies ADD COLUMN call_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER note',
    )
  } catch (e) {
    if (!/duplicate column/i.test(e.message)) throw e
    console.log('（列は既に存在）')
  }

  console.log('架電回数を集計中…')
  const s = Date.now()
  await db.query(`
    UPDATE companies c
    LEFT JOIN (
      SELECT company_id, COUNT(*) AS cnt
      FROM call_logs
      GROUP BY company_id
    ) t ON t.company_id = c.id
    SET c.call_count = COALESCE(t.cnt, 0)
  `)
  console.log(`集計完了: ${Date.now() - s}ms`)

  console.log('インデックスを追加中…')
  for (const sql of [
    'CREATE INDEX idx_pref_call_name ON companies (prefecture, call_count, name)',
    'CREATE INDEX idx_call_count ON companies (call_count)',
  ]) {
    try {
      await db.query(sql)
    } catch (e) {
      if (!/duplicate key/i.test(e.message)) throw e
    }
  }

  const [rows] = await db.query(
    'SELECT COUNT(*) AS total, SUM(call_count = 0) AS uncalled FROM companies',
  )
  console.log('確認:', rows[0])
  console.log('完了')
} finally {
  await db.end()
}
