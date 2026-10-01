import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import AppShell from '@/app/components/AppShell'
import CreateUserForm from '@/app/components/CreateUserForm'
import DeleteInspectionButton from '@/app/components/DeleteInspectionButton'
import { deleteUser, setUserInspector } from '@/app/actions'

export const dynamic = 'force-dynamic'

type User = { id: string; email: string; role: string; created_at: string; inspector_id: string | null; inspector_name: string | null }

// Accounts: email + password (bcrypt-hashed, never selected here) + an
// Admin / General User / Inspector access level. Admin-only page (requireAdmin
// below). An Inspector login is linked to an inspectors row, which decides
// which inspections it sees in the iPad field view.
export default async function ManageUsersPage() {
  await requireAdmin()
  const sql = getSql()
  const users = (await sql`
    select u.id, u.email, u.role, u.created_at, u.inspector_id, n.name as inspector_name
    from users u left join inspectors n on n.id = u.inspector_id
    order by u.created_at
  `) as unknown as User[]
  const inspectors = (await sql`select id, name from inspectors order by name`) as unknown as { id: string; name: string }[]

  return (
    <AppShell active="/setup" title="System Config — Manage Users">
      <div className="p-4 md:p-6 max-w-xl">
        <div className="font-medium">Users</div>
        <div className="text-[12px] text-text-muted mt-1 mb-3">
          Dashboard accounts and their access level. Inspector logins are for the iPad field view and only see their own assigned inspections. Passwords are never shown once set.
        </div>

        <div className="mb-6 space-y-1">
          {users.length === 0 && <div className="text-[13px] text-text-muted italic">No users yet.</div>}
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-2 py-2 border-b border-border"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium truncate">{u.email}</div>
                <div className="text-[11px] text-text-muted">
                  {u.role}
                  {u.role === 'Inspector' && <> ({u.inspector_name ?? 'not linked'})</>} · added{' '}
                  {new Date(u.created_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                </div>
                {u.role === 'Inspector' && (
                  <form action={setUserInspector.bind(null, u.id)} className="flex items-center gap-1.5 mt-1">
                    <select
                      name="inspector_id"
                      defaultValue={u.inspector_id ?? ''}
                      className="border border-border rounded-[var(--radius-sm)] px-1.5 py-0.5 bg-surface text-[12px]"
                    >
                      <option value="">Pick one…</option>
                      {inspectors.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-[11px] font-semibold text-accent">
                      Save link
                    </button>
                  </form>
                )}
              </div>
              <DeleteInspectionButton
                action={deleteUser.bind(null, u.id)}
                confirmMessage={`Delete the user ${u.email}? This cannot be undone.`}
              />
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-border">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-2">Add User</div>
          <CreateUserForm inspectors={inspectors} />
        </div>
      </div>
    </AppShell>
  )
}
