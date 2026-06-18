import mysql from 'mysql2/promise'

// 開発時のホットリロードで接続プールが増殖しないようグローバルに保持する
const globalForDb = globalThis as unknown as {
  _mysqlPool?: mysql.Pool
}

export const db =
  globalForDb._mysqlPool ??
  mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sales_system',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 10,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb._mysqlPool = db
}
