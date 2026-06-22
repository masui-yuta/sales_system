import fs from 'node:fs'
import path from 'node:path'
import mysql from 'mysql2/promise'

/** .env.local を読み込む（dotenv 未使用） */
export function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

function mysqlSslOptions() {
  if (process.env.DB_SSL !== 'true') return undefined
  return { minVersion: 'TLSv1.2', rejectUnauthorized: true }
}

/** スクリプト共通の MySQL 接続プール */
export function createDbPool(overrides = {}) {
  loadEnvLocal()
  const ssl = mysqlSslOptions()
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sales_system',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit: 5,
    ...(ssl ? { ssl } : {}),
    ...overrides,
  })
}
