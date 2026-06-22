import type { PoolOptions } from 'mysql2/promise'

/** TiDB Cloud 等のリモート MySQL 向け SSL（DB_SSL=true） */
export function mysqlSslOptions():
  | { minVersion: 'TLSv1.2'; rejectUnauthorized: true }
  | undefined {
  if (process.env.DB_SSL !== 'true') return undefined
  return { minVersion: 'TLSv1.2', rejectUnauthorized: true }
}

export function mysqlPoolConfig(
  overrides: Partial<PoolOptions> = {},
): PoolOptions {
  const ssl = mysqlSslOptions()
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sales_system',
    charset: 'utf8mb4',
    waitForConnections: true,
    connectionLimit:
      process.env.NODE_ENV === 'production'
        ? Number(process.env.DB_CONNECTION_LIMIT || 3)
        : 10,
    ...(ssl ? { ssl } : {}),
    ...overrides,
  }
}
