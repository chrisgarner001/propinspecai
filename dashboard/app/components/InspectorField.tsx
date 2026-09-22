'use client'

import { useState } from 'react'

const OTHER = '__other__'

// "Inspector is a dropdown or fill in" -- a known inspector picks straight
// from the list (this <select> submits inspector_name directly, no
// separate id/lookup); picking "Other" reveals a plain text input instead,
// same reveal pattern as NewLineItemAssignedTo's Outside Vendor picker.
// Both ultimately submit the same inspector_name field, never both at once.
export default function InspectorField({
  inspectors,
  className,
}: {
  inspectors: { id: string; name: string }[]
  className: string
}) {
  const [value, setValue] = useState('')
  const isOther = value === OTHER

  return (
    <div className="space-y-2">
      <select
        name={isOther ? undefined : 'inspector_name'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={!isOther}
        className={className}
      >
        <option value="" disabled>
          Select inspector…
        </option>
        {inspectors.map((i) => (
          <option key={i.id} value={i.name}>
            {i.name}
          </option>
        ))}
        <option value={OTHER}>Other (type a name)…</option>
      </select>
      {isOther && (
        <input name="inspector_name" required placeholder="Inspector name" className={className} />
      )}
    </div>
  )
}
