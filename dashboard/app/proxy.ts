import { NextRequest, NextResponse } from 'next/server'
import { decrypt, SESSION_COOKIE_NAME } from '@/lib/session'

// Optimistic-only: cookie-signature check and a redirect, nothing more. No
// database call here (Proxy runs on every route including prefetches, so a
// DB round-trip would be wasted work most of the time -- Next.js's own
// stated reason, not a runtime limitation; Proxy runs on Node.js by default
// in Next.js 16). The real, DB-backed enforcement is lib/dal.ts's
// verifySession(), called from every Server Action, Route Handler, and
// app/(app)/layout.tsx. A gap in this file's logic degrades to a missed
// redirect, not a security bypass -- see docs/designs/propinspec-authentication.md.
const ADMIN_ONLY_PREFIXES = ['/setup', '/cost-book']

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = await decrypt(token)

  if (!session) {
    const loginUrl = new URL('/login', req.nextUrl)
    return NextResponse.redirect(loginUrl)
  }

  const isAdminOnlyPath = ADMIN_ONLY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
  if (isAdminOnlyPath && session.role !== 'Admin') {
    return NextResponse.redirect(new URL('/', req.nextUrl))
  }

  return NextResponse.next()
}

// Excludes /login (must stay reachable to log in) and /share/[token] (the
// tenant-facing photo-share link -- public, gated by its own random token,
// not by login) plus static assets/Next internals.
export const config = {
  matcher: ['/((?!login|share|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)'],
}
