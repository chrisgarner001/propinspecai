import Image from 'next/image'
import { requireSession } from '@/lib/dal'
import ChangePasswordForm from '@/app/components/ChangePasswordForm'

// Reached two ways: forced here by requireSession() (any page, any new
// account with must_change_password) or visited directly. skipPasswordCheck
// avoids requireSession() redirecting this page to itself.
export default async function ChangePasswordPage() {
  await requireSession({ skipPasswordCheck: true })

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm border border-border rounded-lg bg-surface p-8 text-center">
        <div className="flex flex-col items-center gap-1 mb-8">
          <Image src="/gpm-logo.png" alt="GPM Property Management" width={182} height={35} priority />
          <div className="font-mono text-[11px] text-text-muted mt-1">
            Powered by <span className="font-sans font-semibold text-text">PropInspec</span>
          </div>
        </div>
        <p className="text-[13px] text-text-muted mb-6">Set your password to continue.</p>
        <ChangePasswordForm />
      </div>
    </div>
  )
}
