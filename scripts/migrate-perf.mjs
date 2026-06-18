// 一覧・市区町村ページの高速化（1回だけ実行）
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
  console.log('インデックスを追加中…')
  for (const sql of [
    'CREATE INDEX idx_call_name_id ON companies (call_count, name, id)',
    'CREATE INDEX idx_pref_city_call ON companies (prefecture, city, call_count)',
  ]) {
    try {
      await db.query(sql)
    } catch (e) {
      if (!/duplicate key/i.test(e.message)) throw e
    }
  }

  console.log('city_stats テーブルを作成中…')
  await db.query(`
    CREATE TABLE IF NOT EXISTS city_stats (
      prefecture VARCHAR(20) NOT NULL,
      city       VARCHAR(50) NOT NULL,
      total      INT UNSIGNED NOT NULL DEFAULT 0,
      uncalled   INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (prefecture, city),
      INDEX idx_pref_uncalled (prefecture, uncalled DESC)
    ) ENGINE=InnoDB
  `)

  console.log('市区町村集計を投入中（42万件の GROUP BY … 数十秒かかります）…')
  const s = Date.now()
  await db.query('TRUNCATE TABLE city_stats')
  await db.query(`
    INSERT INTO city_stats (prefecture, city, total, uncalled)
    SELECT
      prefecture,
      city,
      COUNT(*) AS total,
      SUM(call_count = 0) AS uncalled
    FROM companies
    GROUP BY prefecture, city
  `)
  console.log(`city_stats 投入完了: ${Date.now() - s}ms`)

  const [rows] = await db.query(
    'SELECT COUNT(*) AS cities, SUM(total) AS companies FROM city_stats',
  )
  console.log('確認:', rows[0])
  console.log('完了')
} finally {
  await db.end()
}
