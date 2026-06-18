export const SESSION_COOKIE = 'sales_session'
export const SESSION_MAX_AGE_SEC = 60 * 60 * 12 // 12時間
export const BCRYPT_ROUNDS = 12

export const LOGIN_MAX_FAILURES = 5
export const LOGIN_WINDOW_MIN = 15
export const LOCKOUT_MIN = 30

export type SessionPayload = {
  sid: string
  uid: number
  email: string
}

export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim()
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET が未設定です。.env に 32文字以上のランダム文字列を設定してください。',
    )
  }
  return new TextEncoder().encode(secret)
}

export function validatePassword(password: string): string | null {
  if (password.length < 12) {
    return 'パスワードは12文字以上にしてください'
  }
  if (!/[a-z]/.test(password)) {
    return 'パスワードに小文字を含めてください'
  }
  if (!/[A-Z]/.test(password)) {
    return 'パスワードに大文字を含めてください'
  }
  if (!/[0-9]/.test(password)) {
    return 'パスワードに数字を含めてください'
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return 'パスワードに記号を含めてください'
  }
  return null
}

export function normalizeEmail(email: string): string {
  return email.normalize('NFKC').trim().toLowerCase()
}
