'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import bcrypt from 'bcryptjs'
import { getSql } from '@/lib/db'
import { encrypt, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '@/lib/session'

// A bcrypt hash of a value nobody will ever type, compared against when the
// email isn't found -- keeps "unknown email" and "wrong password" taking
// the same amount of time, so response time can't be used to enumerate
// which emails have accounts.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeOoAv8W5sFmH.mF0j0z5Xz0wR.Uym.Ake'

export async function login(email: string, password: string): Promise<{ error?: string }> {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || !password) {
    return { error: 'Enter your email and password.' }
  }

  const sql = getSql()
  const [user] = await sql`select id, password_hash, role from users where email = ${normalizedEmail}`

  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH)
  if (!user || !valid) {
    return { error: 'Incorrect email or password.' }
  }

  const token = await encrypt({ userId: user.id, role: user.role })
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
  })

  redirect('/')
}

export async function logout() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE_NAME)
  redirect('/login')
}
