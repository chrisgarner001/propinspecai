'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

// Below md, AppShell's sidebar (hidden entirely) is replaced by this slim top
// bar + a tap-to-open drawer, so the nav rail never eats horizontal space on
// a phone. Desktop is untouched -- this only renders in the DOM's mobile
// breakpoint, AppShell's own sidebar renders in the desktop one.
export default function MobileNav({
  active,
  navItems,
}: {
  active: string
  navItems: { href: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden border-b border-border">
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-alt">
        <Image src="/gpm-logo.png" alt="GPM Property Management" width={104} height={20} priority />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className="text-[22px] leading-none px-1 text-text"
        >
          {open ? '×' : '☰'}
        </button>
      </div>
      {open && (
        <ul className="border-t border-border bg-surface-alt">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-3 text-[14px] font-semibold border-b border-border last:border-b-0 ${
                  item.href === active ? 'bg-surface text-text' : 'text-text-muted'
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
