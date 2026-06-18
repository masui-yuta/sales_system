// 管理者ユーザーを作成
//   node scripts/create-user.mjs --email=you@example.com --name="山田太郎" --password="YourStr0ng!Pass"
import process from 'node:process'
import bcrypt from 'bcryptjs'
import mysql from 'mysql2/promise'

const BCRYPT_ROUNDS = 12

function parseArgs(argv) {
  const get = (key) => {
    const hit = argv.find((a) => a.startsWith(`--${key}=`))
    return hit ? hit.split('=').slice(1).join('=') : undefined
  }
  return {
    email: get('email'),
    name: get('name'),
    password: get('password'),
  }
}

function validatePassword(password) {
  if (!password || password.length < 12) {
    return 'パスワードは12文字以上にしてください'
  }
  if (!/[a-z]/.test(password)) return '小文字を含めてください'
  if (!/[A-Z]/.test(password)) return '大文字を含めてください'
  if (!/[0-9]/.test(password)) return '数字を含めてください'
  if (!/[^a-zA-Z0-9]/.test(password)) return '記号を含めてください'
  return null
}

const opts = parseArgs(process.argv.slice(2))
if (!opts.email || !opts.name || !opts.password) {
  console.error(`使い方:
  node scripts/create-user.mjs --email=you@example.com --name="山田太郎" --password="YourStr0ng!Pass"

パスワード要件: 12文字以上・大文字・小文字・数字・記号`)
  process.exit(1)
}

const pwError = validatePassword(opts.password)
if (pwError) {
  console.error(`パスワードが要件を満たしません: ${pwError}`)
  process.exit(1)
}

const email = opts.email.normalize('NFKC').trim().toLowerCase()
const passwordHash = await bcrypt.hash(opts.password, BCRYPT_ROUNDS)

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
  await db.query(
    `INSERT INTO users (email, name, password_hash)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash)`,
    [email, opts.name.trim(), passwordHash],
  )
  console.log(`ユーザーを作成/更新しました: ${email}`)
} finally {
  await db.end()
}
