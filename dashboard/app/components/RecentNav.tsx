'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

const STORAGE_KEY = 'propinspec_recent_views'
const MAX_RECENT = 8
const CHANGE_EVENT = 'propinspec-recent-views-changed'

type RecentEntry = { href: string; label: string; visitedAt: number }

// Per-device, not per-user -- this app has no auth/session concept, so
// localStorage (this browser's own history of what it looked at) is the
// only place "recent" can live. Every access is wrapped in try/catch: a
// private-browsing tab or blocked site data can make localStorage throw,
// and this nav should just quietly show nothing rather than break the page.
function readRecent(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeRecent(entries: RecentEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  } catch {
    // best-effort only
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback)
  return () => window.removeEventListener(CHANGE_EVENT, callback)
}

// useSyncExternalStore needs a stable value to detect "nothing changed" --
// the raw JSON string does that; parsing happens after, at render time.
function getSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '[]'
  } catch {
    return '[]'
  }
}

function getServerSnapshot(): string {
  return '[]'
}

// `label` is whatever this page passed as AppShell's own `title` -- pages
// scoped to one inspection put the property address in that title
// specifically so entries here don't collide (e.g. two different jobs'
// Quote Sheets would otherwise both just say "Quote Sheet").
export default function RecentNav({ label }: { label: string }) {
  const pathname = usePathname()
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  let recent: RecentEntry[] = []
  try {
    recent = JSON.parse(raw)
  } catch {
    recent = []
  }

  // Recording the current visit is a real side effect (a write) and belongs
  // in an effect -- but it must not also call setState itself. The
  // useSyncExternalStore subscription above is what re-renders this
  // component once the write lands (via the dispatched change event),
  // avoiding the "setState synchronously in an effect" cascade a naive
  // readRecent()+setState(...) pairing would trigger.
  useEffect(() => {
    if (!pathname) return
    const existing = readRecent().filter((e) => e.href !== pathname)
    const updated = [{ href: pathname, label, visitedAt: Date.now() }, ...existing].slice(0, MAX_RECENT)
    writeRecent(updated)
  }, [pathname, label])

  const links = recent.filter((e) => e.href !== pathname)
  if (links.length === 0) return null

  return (
    <div className="mt-6 pt-4 border-t border-border">
      <div className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Recent</div>
      <ul className="space-y-0.5">
        {links.map((entry) => (
          <li key={entry.href}>
            <Link
              href={entry.href}
              title={entry.label}
              className="block px-2.5 py-1.5 rounded text-[12.5px] text-text-muted hover:text-text truncate"
            >
              {entry.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
