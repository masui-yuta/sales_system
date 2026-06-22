import mysql from 'mysql2/promise'
import { mysqlPoolConfig } from '@/lib/mysql-config'

// 開発時のホットリロードで接続プールが増殖しないようグローバルに保持する
const globalForDb = globalThis as unknown as {
  _mysqlPool?: mysql.Pool
}

export const db =
  globalForDb._mysqlPool ?? mysql.createPool(mysqlPoolConfig())

if (process.env.NODE_ENV !== 'production') {
  globalForDb._mysqlPool = db
}
