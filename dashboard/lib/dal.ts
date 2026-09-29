import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSql } from './db'
import { decrypt, SESSION_COOKIE_NAME, type SessionPayload } from './session'

export type Session = { userId: string; email: string; role: string; mustChangePassword: boolean }

// The real security boundary (see docs/designs/propinspec-authentication.md,
// Approach A) -- app/proxy.ts only does an optimistic, cookie-only redirect;
// every Server Action, Route Handler, and page component calls this
// directly (via requireSession()/requireAdmin() below, or the *OrThrow
// variants for Server Actions/Route Handlers). Wrapped in React's cache()
// so multiple calls within one request share a single DB round-trip rather
// than re-querying per call site.
//
// Returns null for every failure case alike (no cookie, invalid/expired
// cookie, deleted user, DB error) -- callers treat null as "not
// authenticated" uniformly and must abort rather than proceed. A DB error
// here is deliberately NOT distinguished from "not logged in": falling back
// to trusting the cookie's signature alone during a database outage would
// silently disable revocation with no signal that it happened.
export const verifySession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  const payload: SessionPayload | null = await decrypt(token)
  if (!payload) return null

  try {
    const sql = getSql()
    const [user] = await sql`select id, email, role, must_change_password from users where id = ${payload.userId}`
    if (!user) return null
    return { userId: user.id, email: user.email, role: user.role, mustChangePassword: user.must_change_password }
  } catch (err) {
    console.error('verifySession: database check failed, treating as unauthenticated', err)
    return null
  }
})

// For Server Components (pages) -- redirects to /login instead of returning
// null, since a page has no other way to reject an unauthenticated render.
// skipPasswordCheck is set only by /change-password itself, to avoid
// redirecting that page to itself.
export async function requireSession(opts?: { skipPasswordCheck?: boolean }): Promise<Session> {
  const session = await verifySession()
  if (!session) redirect('/login')
  if (session.mustChangePassword && !opts?.skipPasswordCheck) redirect('/change-password')
  return session
}

// For the 4 Admin-only pages (/setup and its subpages, /cost-book) --
// verifySession()'s own DB check already gives a fresh role, so this is a
// real (not just optimistic) check, unlike proxy.ts's redirect.
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession()
  if (session.role !== 'Admin') redirect('/')
  return session
}

// For Server Actions and Route Handlers -- these have heterogeneous return
// types (void, {error?: string}, {done: boolean; videos: [...]}, etc.), so
// there's no single "reject" value every caller could return early with.
// Throwing works uniformly regardless of return type; Next.js surfaces it
// as a generic error, which is fine here since a real user is always
// already authenticated by the page's own requireSession()/requireAdmin()
// -- this only fires for a direct/replayed call bypassing the UI, not
// normal usage.
// changePassword's own action calls verifySession() directly, not this --
// a must-change-password user needs to reach that one action to escape the
// state. Every other Server Action/Route Handler goes through here and gets
// rejected instead, so a must-change-password session can't be used to
// mutate data by replaying/calling an action directly, bypassing the page
// redirect above (plan-eng-review, 2026-09-29, D4).
export async function requireSessionOrThrow(): Promise<Session> {
  const session = await verifySession()
  if (!session) throw new Error('Not authenticated')
  if (session.mustChangePassword) throw new Error('Password change required')
  return session
}

export async function requireAdminOrThrow(): Promise<Session> {
  const session = await requireSessionOrThrow()
  if (session.role !== 'Admin') throw new Error('Not authorized')
  return session
}
