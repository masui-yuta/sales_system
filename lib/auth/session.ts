import { cookies } from 'next/headers'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  verifySessionCookie,
} from './session-token'
import { getValidSession, type AuthUser } from './users'

export async function getSession(): Promise<AuthUser | null> {
  try {
    const jar = await cookies()
    const token = jar.get(SESSION_COOKIE)?.value
    if (!token) return null

    const payload = await verifySessionCookie(token)
    if (!payload) return null

    return getValidSession(payload)
  } catch {
    return null
  }
}

export async function requireSession(): Promise<AuthUser> {
  const session = await getSession()
  if (!session) {
    throw new Error('認証が必要です')
  }
  return session
}

export async function setSessionCookie(cookieValue: string): Promise<void> {
  const jar = await cookies()
  jar.set(SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SEC,
    path: '/',
  })
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

export { SESSION_COOKIE }
