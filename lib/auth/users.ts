import bcrypt from 'bcryptjs'
import type { RowDataPacket } from 'mysql2'
import { db } from '@/lib/db'
import {
  BCRYPT_ROUNDS,
  LOGIN_MAX_FAILURES,
  LOGIN_WINDOW_MIN,
  LOCKOUT_MIN,
  normalizeEmail,
  SESSION_MAX_AGE_SEC,
  type SessionPayload,
} from './config'
import { generateSessionToken, hashToken } from './crypto'
import { signSessionCookie } from './session-token'

export type AuthUser = {
  id: number
  email: string
  name: string
}

type UserRow = RowDataPacket & {
  id: number
  email: string
  name: string
  password_hash: string
  locked_until: Date | null
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function getUserByEmail(
  email: string,
): Promise<UserRow | null> {
  const [rows] = await db.query<UserRow[]>(
    'SELECT id, email, name, password_hash, locked_until FROM users WHERE email = ? LIMIT 1',
    [normalizeEmail(email)],
  )
  return rows[0] ?? null
}

export async function countRecentFailures(
  email: string,
  ip: string,
): Promise<number> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS failures
     FROM login_attempts
     WHERE success = 0
       AND attempted_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
       AND (email = ? OR ip = ?)`,
    [LOGIN_WINDOW_MIN, normalizeEmail(email), ip],
  )
  return Number(rows[0]?.failures ?? 0)
}

export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean,
): Promise<void> {
  await db.query(
    'INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, ?)',
    [normalizeEmail(email), ip, success ? 1 : 0],
  )
}

export async function lockUser(userId: number): Promise<void> {
  await db.query(
    'UPDATE users SET locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?',
    [LOCKOUT_MIN, userId],
  )
}

export async function createSession(
  user: AuthUser,
  ip: string,
  userAgent: string | null,
): Promise<{ cookieValue: string; token: string }> {
  const token = generateSessionToken()
  const tokenHash = hashToken(token)
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SEC * 1000)

  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
    [tokenHash, user.id, expires, ip, userAgent?.slice(0, 255) ?? null],
  )

  const payload: SessionPayload = {
    sid: tokenHash,
    uid: user.id,
    email: user.email,
  }
  const cookieValue = await signSessionCookie(payload)
  return { cookieValue, token: tokenHash }
}

export async function getValidSession(
  payload: SessionPayload,
): Promise<AuthUser | null> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT u.id, u.email, u.name
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?
       AND s.expires_at > NOW()
       AND s.revoked_at IS NULL
       AND (u.locked_until IS NULL OR u.locked_until <= NOW())
     LIMIT 1`,
    [payload.sid],
  )
  const row = rows[0]
  if (!row) return null
  return {
    id: Number(row.id),
    email: String(row.email),
    name: String(row.name),
  }
}

export async function revokeSession(tokenHash: string): Promise<void> {
  await db.query(
    'UPDATE sessions SET revoked_at = NOW() WHERE token_hash = ?',
    [tokenHash],
  )
}

export async function revokeAllUserSessions(userId: number): Promise<void> {
  await db.query(
    'UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
    [userId],
  )
}

export async function authenticateUser(
  email: string,
  password: string,
  ip: string,
  userAgent: string | null,
): Promise<
  | { ok: true; cookieValue: string }
  | { ok: false; error: string }
> {
  const normalized = normalizeEmail(email)
  const failures = await countRecentFailures(normalized, ip)
  if (failures >= LOGIN_MAX_FAILURES) {
    return {
      ok: false,
      error: `ログイン試行が多すぎます。${LOGIN_WINDOW_MIN}分後に再度お試しください。`,
    }
  }

  const user = await getUserByEmail(normalized)
  if (!user) {
    await recordLoginAttempt(normalized, ip, false)
    return { ok: false, error: 'メールアドレスまたはパスワードが正しくありません' }
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return {
      ok: false,
      error: 'アカウントが一時ロックされています。しばらくしてから再度お試しください。',
    }
  }

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) {
    await recordLoginAttempt(normalized, ip, false)
    const newFailures = failures + 1
    if (newFailures >= LOGIN_MAX_FAILURES) {
      await lockUser(user.id)
      return {
        ok: false,
        error: `ログインに${LOGIN_MAX_FAILURES}回失敗したため、${LOCKOUT_MIN}分間ロックしました。`,
      }
    }
    return {
      ok: false,
      error: 'メールアドレスまたはパスワードが正しくありません',
    }
  }

  await recordLoginAttempt(normalized, ip, true)
  await db.query('UPDATE users SET locked_until = NULL WHERE id = ?', [user.id])

  const { cookieValue } = await createSession(
    { id: user.id, email: user.email, name: user.name },
    ip,
    userAgent,
  )

  return { ok: true, cookieValue }
}
