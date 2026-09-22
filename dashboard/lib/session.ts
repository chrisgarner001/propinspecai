import 'server-only'
import { SignJWT, jwtVerify } from 'jose'

// Sole place the session cookie's jose calls live -- app/proxy.ts and
// lib/dal.ts both import encrypt()/decrypt() from here rather than each
// calling jose directly, so the algorithm/secret handling only needs
// changing in one place (found as a DRY risk during /plan-eng-review).
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days, confirmed 2026-09-22

function getEncodedKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET is not set')
  }
  return new TextEncoder().encode(secret)
}

export type SessionPayload = {
  userId: string
  role: string
}

export async function encrypt(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor((Date.now() + SESSION_DURATION_MS) / 1000))
    .sign(getEncodedKey())
}

// Returns null on any failure (missing/tampered/expired token) rather than
// throwing -- callers (proxy.ts's optimistic check, dal.ts's verifySession())
// both treat "no valid session" as the normal unauthenticated case, not an
// exceptional one.
export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getEncodedKey(), { algorithms: ['HS256'] })
    if (typeof payload.userId !== 'string' || typeof payload.role !== 'string') return null
    return { userId: payload.userId, role: payload.role }
  } catch {
    return null
  }
}

export const SESSION_COOKIE_NAME = 'session'
export const SESSION_MAX_AGE_SECONDS = SESSION_DURATION_MS / 1000
