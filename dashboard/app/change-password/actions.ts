'use server'

import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { getSql } from '@/lib/db'
import { verifySession } from '@/lib/dal'

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ error?: string }> {
  const session = await verifySession()
  if (!session) redirect('/login')

  if (newPassword.length < 8) {
    return { error: 'New password must be at least 8 characters.' }
  }

  const sql = getSql()
  const [user] = await sql`select password_hash from users where id = ${session.userId}`
  const valid = user && (await bcrypt.compare(currentPassword, user.password_hash))
  if (!valid) {
    return { error: 'Current password is incorrect.' }
  }

  const newHash = await bcrypt.hash(newPassword, 12)
  await sql`update users set password_hash = ${newHash}, must_change_password = false where id = ${session.userId}`

  redirect('/')
}
