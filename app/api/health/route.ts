import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const authSecret = process.env.AUTH_SECRET?.trim()
  const authOk = Boolean(authSecret && authSecret.length >= 32)
  const dbSsl = process.env.DB_SSL?.trim().toLowerCase() === 'true'

  let dbOk = false
  let dbError: string | null = null
  try {
    await db.query('SELECT 1 AS ok')
    dbOk = true
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    ok: authOk && dbOk,
    auth: authOk,
    db: dbOk,
    dbSsl,
    dbHost: process.env.DB_HOST ? 'set' : 'missing',
    dbError,
  })
}
