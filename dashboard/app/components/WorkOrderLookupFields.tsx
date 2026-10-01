'use client'

import { useState } from 'react'
import { lookupPropertywareWorkOrder } from '@/app/actions'

// Work order number + property address for the new-inspection form. "Look
// up" fills the address from Propertyware (lib/propertyware.ts); the address
// stays a normal editable input with the Properties autofill list, so a
// failed or missing lookup never blocks creating the inspection.
export default function WorkOrderLookupFields({
  propertyAddresses,
  inputClass,
  labelClass,
  helpClass,
}: {
  propertyAddresses: string[]
  inputClass: string
  labelClass: string
  helpClass: string
}) {
  const [workOrder, setWorkOrder] = useState('')
  const [address, setAddress] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)

  async function lookUp() {
    if (!workOrder.trim()) return
    setPending(true)
    setMessage(null)
    const result = await lookupPropertywareWorkOrder(workOrder)
    setPending(false)
    if (result.propertyAddress) {
      setAddress(result.propertyAddress)
      setMessage({ tone: 'ok', text: result.description ? `Found: ${result.description}` : 'Found in Propertyware.' })
    } else {
      setMessage({ tone: 'warn', text: result.warning ?? result.error ?? 'Lookup failed.' })
    }
  }

  return (
    <>
      <div>
        <label className={labelClass}>Work order number</label>
        <div className="flex gap-2">
          <input
            name="job_number"
            required
            value={workOrder}
            onChange={(e) => setWorkOrder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                lookUp()
              }
            }}
            className="data-mono w-full border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 bg-surface"
          />
          <button
            type="button"
            onClick={lookUp}
            disabled={pending || !workOrder.trim()}
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap disabled:opacity-50"
          >
            {pending ? 'Looking up…' : 'Look up'}
          </button>
        </div>
        {message ? (
          <div className={`text-[12px] mt-1 ${message.tone === 'ok' ? 'text-text-muted' : 'text-error'}`}>{message.text}</div>
        ) : (
          <div className={helpClass}>Look up fills the property address from the Propertyware work order.</div>
        )}
      </div>
      <div>
        <label className={labelClass}>Property address</label>
        <input
          list="property-addresses"
          name="property_address"
          required
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={inputClass}
        />
        <datalist id="property-addresses">
          {propertyAddresses.map((a) => (
            <option key={a} value={a} />
          ))}
        </datalist>
        <div className={helpClass}>Or start typing the address for autofill from Properties.</div>
      </div>
    </>
  )
}
