import { logout } from '@/app/login/actions'

export default function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logout}>
      <button
        type="submit"
        className={className ?? 'text-[13px] font-semibold text-text-muted hover:text-text'}
      >
        Log out
      </button>
    </form>
  )
}
