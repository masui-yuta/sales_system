'use server'

import type { RowDataPacket } from 'mysql2'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { requireSession } from '@/lib/auth/session'

export async function updateCompany(formData: FormData) {
  await requireSession()
  const id = Number(formData.get('companyId'))
  if (!id) return

  const phone = (String(formData.get('phone') ?? '').trim()) || null
  const industry = (String(formData.get('industry') ?? '').trim()) || null
  const note = (String(formData.get('note') ?? '').trim()) || null

  await db.query(
    'UPDATE companies SET phone = ?, industry = ?, note = ? WHERE id = ?',
    [phone, industry, note, id],
  )

  revalidatePath(`/companies/${id}`)
}

export async function addCallLog(formData: FormData) {
  await requireSession()
  const id = Number(formData.get('companyId'))
  const result = String(formData.get('result') ?? '').trim()
  if (!id || !result) return

  const memo = (String(formData.get('memo') ?? '').trim()) || null

  const [before] = await db.query<RowDataPacket[]>(
    'SELECT call_count, prefecture, city FROM companies WHERE id = ? LIMIT 1',
    [id],
  )
  const row = before[0] as
    | { call_count: number; prefecture: string; city: string }
    | undefined
  if (!row) return

  await db.query(
    'INSERT INTO call_logs (company_id, result, memo) VALUES (?, ?, ?)',
    [id, result, memo],
  )
  await db.query(
    'UPDATE companies SET call_count = call_count + 1 WHERE id = ?',
    [id],
  )

  if (row.call_count === 0) {
    await db.query(
      `UPDATE city_stats
       SET uncalled = GREATEST(uncalled - 1, 0)
       WHERE prefecture = ? AND city = ?`,
      [row.prefecture, row.city],
    )
  }

  revalidatePath(`/companies/${id}`)
  revalidatePath('/companies')
}
