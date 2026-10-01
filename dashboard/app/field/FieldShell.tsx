import Image from 'next/image'
import Link from 'next/link'
import LogoutButton from '@/app/components/LogoutButton'

// The iPad field view's own chrome: no office nav rail (an Inspector can't
// reach those pages anyway), larger type and touch targets, one column.
// Brand lockup follows DESIGN.md -- GPM mark leads, "Powered by PropInspec"
// small and secondary.
export default function FieldShell({ children, back }: { children: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface">
        <div className="flex flex-col items-start gap-1">
          <Image src="/gpm-logo.png" alt="GPM Property Management" width={156} height={30} priority />
          <div className="font-mono text-text-muted text-[10px]">
            Powered by <span className="font-sans font-semibold text-text text-[12px]">PropInspec</span>
          </div>
        </div>
        <LogoutButton className="min-h-11 px-3 text-[15px] font-semibold text-text-muted hover:text-text" />
      </header>
      <main className="max-w-3xl mx-auto px-4 py-5 pb-24">
        {back && (
          <Link href={back.href} className="inline-flex items-center min-h-11 text-[15px] font-semibold text-accent mb-2">
            ← {back.label}
          </Link>
        )}
        {children}
      </main>
    </div>
  )
}
