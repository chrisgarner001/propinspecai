type Vendor = { id: string; name: string }

export default function VendorSelect({
  name,
  vendors,
  defaultValue,
}: {
  name: string
  vendors: Vendor[]
  defaultValue: string | null
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ''}
      className="text-[12px] border border-border rounded-[var(--radius-sm)] px-1.5 py-1 w-full bg-surface text-accent font-medium cursor-pointer"
    >
      <option value="">Select vendor…</option>
      {vendors.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  )
}
