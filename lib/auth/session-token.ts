import { SignJWT, jwtVerify } from 'jose'
import {
  getAuthSecret,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  type SessionPayload,
} from './config'

export async function signSessionCookie(
  payload: SessionPayload,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(getAuthSecret())
}

export async function verifySessionCookie(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), {
      algorithms: ['HS256'],
    })
    const sid = payload.sid
    const uid = payload.uid
    const email = payload.email
    if (
      typeof sid !== 'string' ||
      (typeof uid !== 'number' && typeof uid !== 'string') ||
      typeof email !== 'string'
    ) {
      return null
    }
    return { sid, uid: Number(uid), email }
  } catch {
    return null
  }
}

export { SESSION_COOKIE, SESSION_MAX_AGE_SEC }
