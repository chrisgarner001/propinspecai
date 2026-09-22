import { requireAdmin } from '@/lib/dal'
import AppShell from '@/app/components/AppShell'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

// The old single mega-page (one giant form covering General Settings,
// Vendors, Inspection Types, and Inspectors, plus link-outs to Stages/
// Users/Cost Book) split into its own sub-pages, with this becoming a pure
// intro + menu hub (user request, 2026-09-22: "create an introduction page
// with instructions and a menu of the sub sections we have already") --
// matches the pattern Stages/Users/Cost Book already used, just applied
// consistently to every section instead of only some of them.
const SECTIONS = [
  {
    href: '/setup/general',
    title: 'General Settings',
    description: 'GPM labor charge and material/vendor markup percentages used across every inspection.',
  },
  {
    href: '/setup/vendors',
    title: 'Vendors',
    description: 'Outside vendors available in the Assigned To picker on inspections.',
  },
  {
    href: '/setup/inspection-types',
    title: 'Inspection Types',
    description: 'The catalog behind the Inspection Type picker on Add New Inspection (Move-Out, Move-In, and any others added).',
  },
  {
    href: '/setup/inspectors',
    title: 'Inspectors',
    description: 'The catalog behind the Inspector dropdown on Add New Inspection.',
  },
  {
    href: '/setup/stages',
    title: 'Stages',
    description: 'The rehab/turn stages used on the Quote Sheet and Dispatch Board, and their display order.',
  },
  {
    href: '/setup/users',
    title: 'Users',
    description: 'Dashboard accounts and their access level (Admin / General User).',
  },
  {
    href: '/cost-book',
    title: 'Cost Book',
    description: 'Reference pricing for materials and labor. Also on the main menu — kept here too for API/data-upload setup as that lands.',
  },
]

export default async function SystemConfigPage() {
  await requireAdmin()

  return (
    <AppShell active="/setup" title="System Config">
      <div className="px-4 md:px-6 pt-5 pb-2 max-w-2xl">
        <p className="text-[13px] text-text-muted">
          Admin-only configuration for the whole app — reference catalogs (Vendors, Inspection Types, Inspectors,
          Stages), pricing defaults, user accounts, and the Cost Book. Pick a section below.
        </p>
      </div>
      <div className="px-4 md:px-6 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="border border-border rounded-[var(--radius-md)] p-4 hover:border-accent hover:bg-surface-alt"
          >
            <div className="font-display font-bold text-[14px]">{s.title}</div>
            <div className="text-[12px] text-text-muted mt-1">{s.description}</div>
          </Link>
        ))}
      </div>
    </AppShell>
  )
}
