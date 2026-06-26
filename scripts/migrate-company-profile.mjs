// companies に資本金・従業員数・Web/採用URL列を追加
import { createDbPool } from './db-pool.mjs'

const db = createDbPool({ connectionLimit: 1 })

const columns = [
  'ADD COLUMN capital_yen BIGINT UNSIGNED NULL AFTER industry',
  'ADD COLUMN employee_count INT UNSIGNED NULL AFTER capital_yen',
  'ADD COLUMN website_url VARCHAR(512) NULL AFTER employee_count',
  'ADD COLUMN recruit_url VARCHAR(512) NULL AFTER website_url',
]

try {
  for (const clause of columns) {
    try {
      await db.query(`ALTER TABLE companies ${clause}`)
      console.log('OK:', clause.split(' ')[2])
    } catch (e) {
      if (!/duplicate column/i.test(e.message)) throw e
      console.log('SKIP:', clause.split(' ')[2])
    }
  }
  console.log('完了')
} finally {
  await db.end()
}
