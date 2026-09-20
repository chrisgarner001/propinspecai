import Image from 'next/image'
import Link from 'next/link'
import RecentNav from './RecentNav'

const NAV_ITEMS = [
  { href: '/', label: 'Inspections' },
  { href: '/dispatch-board', label: 'Dispatch Board' },
  { href: '/setup', label: 'Set Up' },
]

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <Image
        // native asset is 520x100 (5.2:1) — width/height below preserve that ratio exactly
        src="/gpm-logo.png"
        alt="GPM Property Management"
        width={compact ? 125 : 182}
        height={compact ? 24 : 35}
        priority
      />
      <div className={`font-mono text-text-muted ${compact ? 'text-[9px]' : 'text-[11px]'}`}>
        Powered by{' '}
        <span className={`font-sans font-semibold text-text ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
          PropInspec
        </span>
      </div>
    </div>
  )
}

export default function AppShell({
  active,
  title,
  wide = false,
  headerContent,
  children,
}: {
  active: string
  title: string
  wide?: boolean
  // Escape hatch for a page that needs richer header content than a plain
  // title (e.g. the inspection detail page's Property/Job/Inspector line) --
  // replaces the default header row entirely when given, rather than adding
  // a third prop-driven layout variant to reason about. `title` still needs
  // to be passed either way: RecentNav and the browser tab both key off it
  // regardless of what's visually in the header.
  headerContent?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      className={`grid grid-cols-[200px_minmax(0,1fr)] border border-border rounded-lg overflow-hidden bg-surface mx-auto my-10 w-full ${wide ? 'max-w-[1440px]' : 'max-w-6xl'}`}
    >
      <nav className="bg-surface-alt border-r border-border p-4">
        <div className="mb-6">
          <BrandLockup compact />
        </div>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block px-2.5 py-2 rounded text-[13px] font-semibold ${
                  item.href === active
                    ? 'bg-surface text-text'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <RecentNav label={title} />
      </nav>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border">
          {headerContent ?? <h1 className="font-display font-bold text-[17px] truncate">{title}</h1>}
        </header>
        <main>{children}</main>
      </div>
    </div>
  )
}
