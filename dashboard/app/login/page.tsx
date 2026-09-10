import Image from 'next/image'
import Link from 'next/link'

// Decorative placeholder for now -- no user/session model exists yet, so this
// screen does not gate access to the rest of the app. See DESIGN.md.
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm border border-border rounded-lg bg-surface p-8 text-center">
        <div className="flex flex-col items-center gap-1 mb-8">
          <Image src="/gpm-logo.png" alt="GPM Property Management" width={182} height={35} priority />
          <div className="font-mono text-[11px] text-text-muted mt-1">
            Powered by <span className="font-sans font-semibold text-text">PropInspec</span>
          </div>
        </div>
        <p className="text-[13px] text-text-muted mb-6">Move-out inspection review dashboard</p>
        <Link
          href="/"
          className="inline-block w-full bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-4 py-2.5 text-[13px] font-semibold"
        >
          Continue
        </Link>
      </div>
    </div>
  )
}
