import { getSql } from '@/lib/db'
import { createInspection } from '@/app/actions'
import { requireSession } from '@/lib/dal'
import AppShell from '@/app/components/AppShell'
import SpecialInstructionsField from '@/app/components/SpecialInstructionsField'
import InspectorField from '@/app/components/InspectorField'

export const dynamic = 'force-dynamic'

const inputClass = 'border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface'
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1'
const helpClass = 'text-[12px] text-text-muted mt-1'
const driveLinkClass = 'text-[12px] text-accent underline decoration-accent/40 hover:text-accent-hover whitespace-nowrap'

const SPECIAL_INSTRUCTIONS_EXAMPLE = `The house has serious damage to the walls and carpet, this is pointed out in the video but is throughout the entire house. The backyard is completely overgrown. The garage needs special attention, looks like structural damage.`

type NamedRow = { id: string; name: string }

export default async function NewInspectionPage() {
  await requireSession()
  const sql = getSql()

  const inspectionTypes = (await sql`
    select id, name from inspection_types order by (name = 'Move-Out') desc, name
  `) as unknown as NamedRow[]
  const inspectors = (await sql`select id, name from inspectors order by name`) as unknown as NamedRow[]
  // Autofill source for the address field below -- the Properties list is
  // manual entry for now (no real PropertyWare API access/docs exist yet,
  // see docs/designs/propinspec-inspection-type-gallery.md's sibling
  // Properties work), but every address already in it is worth suggesting.
  const properties = (await sql`select address from properties order by address`) as unknown as { address: string }[]

  return (
    <AppShell active="/inspections" title="Add new inspection">
      <form action={createInspection} className="p-6 max-w-lg space-y-4">
        <div>
          <label className={labelClass}>Inspection type</label>
          <select name="inspection_type" defaultValue="Move-Out" className={inputClass}>
            {inspectionTypes.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Property address</label>
          <input list="property-addresses" name="property_address" required className={inputClass} />
          <datalist id="property-addresses">
            {properties.map((p) => (
              <option key={p.address} value={p.address} />
            ))}
          </datalist>
          <div className={helpClass}>Start typing the address for autofill from Properties.</div>
        </div>
        <div>
          <label className={labelClass}>Work order number</label>
          <input name="job_number" required className="data-mono w-full border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 bg-surface" />
        </div>
        <div>
          <label className={labelClass}>Inspector</label>
          <InspectorField inspectors={inspectors} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Inspection date</label>
          <input name="inspection_date" type="date" required className="data-mono w-full border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 bg-surface" />
        </div>

        <div className="pt-2 border-t border-border" />

        <div>
          <div className="flex items-center justify-between gap-2">
            <label className={labelClass}>Source video folder (Google Drive)</label>
            <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener noreferrer" className={driveLinkClass}>
              Browse Google Drive ↗
            </a>
          </div>
          <input
            name="source_video_drive_folder_url"
            type="url"
            placeholder="https://drive.google.com/drive/folders/…"
            className={`${inputClass} data-mono`}
          />
          <div className={helpClass}>
            The Drive folder holding the raw MP4 walkthrough clips for this inspection. Open Drive, find the
            folder, copy its link, paste it here.
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className={labelClass}>Move-in inspection report (Google Drive)</label>
            <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener noreferrer" className={driveLinkClass}>
              Browse Google Drive ↗
            </a>
          </div>
          <input
            name="move_in_report_drive_url"
            type="url"
            placeholder="https://drive.google.com/file/d/…"
            className={`${inputClass} data-mono`}
          />
          <div className={helpClass}>Link to the original move-in report, for reference when judging tenant-caused damage.</div>
        </div>
        <div>
          <label className={labelClass}>Special instructions</label>
          <SpecialInstructionsField name="special_instructions" placeholder={SPECIAL_INSTRUCTIONS_EXAMPLE} />
          <div className={helpClass}>Optional context for whoever reviews this inspection. Type it or use the mic.</div>
        </div>

        <div className="pt-2 border-t border-border" />

        <div>
          <label className={labelClass}>Lease name</label>
          <input name="lease_name" className={inputClass} />
          <div className={helpClass}>Optional. Merged into the Move-Out Report as an exhibit. Can be filled in later.</div>
        </div>
        <div>
          <label className={labelClass}>Security deposit</label>
          <input
            name="security_deposit_amount"
            type="number"
            step="0.01"
            placeholder="0.00"
            className={`${inputClass} data-mono`}
          />
          <div className={helpClass}>Optional. Also merged into the Move-Out Report. Can be filled in later.</div>
        </div>

        <button
          type="submit"
          className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-4 py-2 text-[13px] font-semibold"
        >
          Create inspection
        </button>
      </form>
    </AppShell>
  )
}
