'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  authenticateUser,
  revokeSession,
} from '@/lib/auth/users'
import {
  clearSessionCookie,
  getSession,
  setSessionCookie,
} from '@/lib/auth/session'
import { verifySessionCookie, SESSION_COOKIE } from '@/lib/auth/session-token'
import { cookies } from 'next/headers'

function getClientIp(headerStore: Headers): string {
  const forwarded = headerStore.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown'
  }
  return headerStore.get('x-real-ip')?.trim() || 'unknown'
}

export type LoginState = {
  error?: string
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')
  const from = String(formData.get('from') ?? '/')

  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください' }
  }

  const headerStore = await headers()
  const ip = getClientIp(headerStore)
  const userAgent = headerStore.get('user-agent')

  let result
  try {
    result = await authenticateUser(email, password, ip, userAgent)
  } catch (e) {
    console.error('loginAction failed:', e)
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('AUTH_SECRET')) {
      return { error: 'サーバー設定エラー: AUTH_SECRET が未設定です（Vercel の環境変数を確認）' }
    }
    if (/ECONNREFUSED|ETIMEDOUT|insecure transport|Access denied|ENOTFOUND/i.test(msg)) {
      return { error: 'サーバー設定エラー: データベースに接続できません（DB_* と DB_SSL=true を確認）' }
    }
    return { error: `ログイン処理に失敗しました: ${msg}` }
  }

  if (!result.ok) {
    return { error: result.error }
  }

  await setSessionCookie(result.cookieValue)

  const dest =
    from.startsWith('/') && !from.startsWith('/login') ? from : '/'
  redirect(dest)
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    const payload = await verifySessionCookie(token)
    if (payload) {
      await revokeSession(payload.sid)
    }
  }

  await clearSessionCookie()
  redirect('/login')
}

export async function getCurrentUser() {
  return getSession()
}
