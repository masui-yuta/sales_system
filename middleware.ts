import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  verifySessionCookie,
} from '@/lib/auth/session-token'

const PUBLIC_PATHS = ['/login', '/api/health']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(SESSION_COOKIE)?.value
  let session = null
  if (token) {
    try {
      session = await verifySessionCookie(token)
    } catch {
      session = null
    }
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (session) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  if (!session) {
    const login = new URL('/login', request.url)
    if (pathname !== '/') {
      login.searchParams.set('from', pathname)
    }
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
