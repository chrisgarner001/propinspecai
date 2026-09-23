'use client'

import { useTransition } from 'react'
import { deleteStockItem } from '@/app/cost-book/actions'

// A plain <form> here (like DeleteInspectionButton) would nest inside the
// row's own <form action={updateStockItem}> on the Stock Items page --
// invalid HTML (forms can't nest) and a real React hydration error, caught
// live via /browse against the dev server. Calling the server action
// directly from a button's onClick, same pattern as
// PostMoveOutReportButton, avoids the nesting entirely.
export default function DeleteStockItemButton({ id, materialName }: { id: string; materialName: string }) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm(`Delete Stock Item "${materialName}"? This cannot be undone.`)) return
    startTransition(() => deleteStockItem(id))
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-[12px] font-semibold text-text-muted hover:text-red-600 disabled:opacity-50"
    >
      {isPending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
