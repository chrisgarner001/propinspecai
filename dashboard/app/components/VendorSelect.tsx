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
      className="appearance-none bg-transparent border-none p-0 text-accent underline decoration-accent/40 hover:text-accent-hover cursor-pointer text-[13px] font-medium"
    >
      <option value="">Outside Vendor</option>
      {vendors.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name}
        </option>
      ))}
    </select>
  )
}
