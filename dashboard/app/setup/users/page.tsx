import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import AppShell from '@/app/components/AppShell'
import CreateUserForm from '@/app/components/CreateUserForm'
import DeleteInspectionButton from '@/app/components/DeleteInspectionButton'
import { deleteUser } from '@/app/actions'

export const dynamic = 'force-dynamic'

type User = { id: string; email: string; role: string; created_at: string }

// Accounts: email + password (bcrypt-hashed, never selected here) + an
// Admin / General User access level. Admin-only page (requireAdmin below).
export default async function ManageUsersPage() {
  await requireAdmin()
  const sql = getSql()
  const users = (await sql`
    select id, email, role, created_at from users order by created_at
  `) as unknown as User[]

  return (
    <AppShell active="/setup" title="System Config — Manage Users">
      <div className="p-4 md:p-6 max-w-xl">
        <div className="font-medium">Users</div>
        <div className="text-[12px] text-text-muted mt-1 mb-3">
          Dashboard accounts and their access level. Passwords are never shown once set.
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
                  {u.role} · added{' '}
                  {new Date(u.created_at).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                </div>
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
          <CreateUserForm />
        </div>
      </div>
    </AppShell>
  )
}
