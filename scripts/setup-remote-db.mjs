// 本番 DB（TiDB Cloud 等）の初期セットアップ
// .env.local にリモート接続情報を書いてから実行:
//   npm run db:setup-remote
//
// 1. db/tables.sql でテーブル作成
// 2. migrate-auth / migrate-perf / migrate-call-count を順に実行

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createDbPool } from './db-pool.mjs'

const db = createDbPool({ connectionLimit: 1 })

function runScript(name) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join('scripts', name)], {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env,
    })
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`)),
    )
  })
}

async function applyTablesSql() {
  const sqlPath = path.join('db', 'tables.sql')
  const sql = fs
    .readFileSync(sqlPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)

  console.log(`テーブル定義を適用中 (${statements.length} 文)…`)
  for (const stmt of statements) {
    await db.query(stmt)
  }
}

try {
  console.log('接続先:', {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
  })

  await applyTablesSql()
  await db.end()

  for (const script of [
    'migrate-auth.mjs',
    'migrate-call-count.mjs',
    'migrate-perf.mjs',
  ]) {
    console.log(`\n▶ ${script}`)
    await runScript(script)
  }

  console.log('\n完了。次: npm run db:create-user -- --email=... --name=... --password="..."')
} catch (err) {
  console.error(err)
  process.exit(1)
}
