import { describe, expect, it, vi, beforeEach } from 'vitest'

// dal.ts itself (the module under test, unlike in actions.test.ts where it's
// mocked away) imports 'server-only' -- a real package that isn't installed
// (it's a webpack-alias marker, not a runtime module), so it needs its own
// stub here the same way @/lib/dal is stubbed for other test files.
vi.mock('server-only', () => ({}))

// verifySession() is wrapped in React's cache(), which memoizes per module
// instance -- vi.resetModules() + a fresh dynamic import per test avoids one
// test's mocked session bleeding into the next via that cache (plan-eng-review,
// 2026-09-29).

let cookieValue: string | undefined
let userRow: { id: string; email: string; role: string; must_change_password: boolean } | undefined

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (_name: string) => (cookieValue ? { value: cookieValue } : undefined),
  })),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/session', () => ({
  decrypt: vi.fn(async (token: string | undefined) =>
    token === 'valid-token' ? { userId: 'u1', role: 'General User' } : null
  ),
  SESSION_COOKIE_NAME: 'session',
}))

vi.mock('@/lib/db', () => ({
  getSql: () => (..._args: unknown[]) => Promise.resolve(userRow ? [userRow] : []),
}))

beforeEach(() => {
  vi.resetModules()
  cookieValue = undefined
  userRow = undefined
})

describe('requireSession / must_change_password', () => {
  it('redirects to /change-password for a must-change-password session', async () => {
    cookieValue = 'valid-token'
    userRow = { id: 'u1', email: 'a@example.com', role: 'General User', must_change_password: true }
    const { requireSession } = await import('./dal')

    await expect(requireSession()).rejects.toThrow('REDIRECT:/change-password')
  })

  it('does not redirect when skipPasswordCheck is set (the /change-password page itself)', async () => {
    cookieValue = 'valid-token'
    userRow = { id: 'u1', email: 'a@example.com', role: 'General User', must_change_password: true }
    const { requireSession } = await import('./dal')

    const session = await requireSession({ skipPasswordCheck: true })
    expect(session.mustChangePassword).toBe(true)
  })

  it('does not redirect when must_change_password is false', async () => {
    cookieValue = 'valid-token'
    userRow = { id: 'u1', email: 'a@example.com', role: 'General User', must_change_password: false }
    const { requireSession } = await import('./dal')

    const session = await requireSession()
    expect(session.mustChangePassword).toBe(false)
  })

  it('still redirects to /login first when there is no session at all, before any password check', async () => {
    cookieValue = undefined
    const { requireSession } = await import('./dal')

    await expect(requireSession()).rejects.toThrow('REDIRECT:/login')
  })
})

describe('requireSessionOrThrow / requireAdminOrThrow -- block must-change-password sessions (D4)', () => {
  it('requireSessionOrThrow throws for a must-change-password session instead of returning it', async () => {
    cookieValue = 'valid-token'
    userRow = { id: 'u1', email: 'a@example.com', role: 'General User', must_change_password: true }
    const { requireSessionOrThrow } = await import('./dal')

    await expect(requireSessionOrThrow()).rejects.toThrow('Password change required')
  })

  it('requireAdminOrThrow also throws for a must-change-password Admin session (inherits the same check)', async () => {
    cookieValue = 'valid-token'
    userRow = { id: 'u1', email: 'a@example.com', role: 'Admin', must_change_password: true }
    const { requireAdminOrThrow } = await import('./dal')

    await expect(requireAdminOrThrow()).rejects.toThrow('Password change required')
  })

  it('requireSessionOrThrow succeeds normally once must_change_password is false', async () => {
    cookieValue = 'valid-token'
    userRow = { id: 'u1', email: 'a@example.com', role: 'General User', must_change_password: false }
    const { requireSessionOrThrow } = await import('./dal')

    const session = await requireSessionOrThrow()
    expect(session.userId).toBe('u1')
  })

  it('verifySession itself never redirects/throws for a must-change-password session -- changePassword\'s own action calls this directly to escape the state', async () => {
    cookieValue = 'valid-token'
    userRow = { id: 'u1', email: 'a@example.com', role: 'General User', must_change_password: true }
    const { verifySession } = await import('./dal')

    const session = await verifySession()
    expect(session?.mustChangePassword).toBe(true)
  })
})
