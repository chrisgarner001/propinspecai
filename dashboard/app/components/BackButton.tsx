'use client'

import { useRouter } from 'next/navigation'

// A universal back arrow at the start of every page's header (user
// request, 2026-09-22) -- lives in AppShell itself so it's automatic on
// every page rather than something each page has to opt into individually.
// Goes to actual browser history (wherever the reviewer came from), not a
// hardcoded per-page "parent" -- correct for pages already reached several
// different ways (e.g. the inspection detail page from the Dashboard,
// Inspections list, or Dispatch Board) without needing separate logic per
// entry point.
export default function BackButton() {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Back"
      title="Back"
      className="text-text-muted hover:text-accent text-[18px] leading-none shrink-0 -ml-0.5"
    >
      ←
    </button>
  )
}
