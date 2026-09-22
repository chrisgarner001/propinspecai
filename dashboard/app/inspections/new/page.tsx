import { createInspection } from '@/app/actions'
import { requireSession } from '@/lib/dal'
import AppShell from '@/app/components/AppShell'
import SpecialInstructionsField from '@/app/components/SpecialInstructionsField'

const inputClass = 'border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface'
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1'
const helpClass = 'text-[12px] text-text-muted mt-1'

const SPECIAL_INSTRUCTIONS_EXAMPLE = `The house has serious damage to the walls and carpet, this is pointed out in the video but is throughout the entire house. The backyard is completely overgrown. The garage needs special attention, looks like structural damage.`

export default async function NewInspectionPage() {
  await requireSession()
  return (
    <AppShell active="/" title="Add new inspection">
      <form action={createInspection} className="p-6 max-w-lg space-y-4">
        <div>
          <label className={labelClass}>Property address</label>
          <input name="property_address" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Job number</label>
          <input name="job_number" required className="data-mono w-full border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 bg-surface" />
        </div>
        <div>
          <label className={labelClass}>Inspector</label>
          <input name="inspector_name" required className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Inspection date</label>
          <input name="inspection_date" type="date" required className="data-mono w-full border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 bg-surface" />
        </div>

        <div className="pt-2 border-t border-border" />

        <div>
          <label className={labelClass}>Source video folder (Google Drive)</label>
          <input
            name="source_video_drive_folder_url"
            type="url"
            placeholder="https://drive.google.com/drive/folders/…"
            className={`${inputClass} data-mono`}
          />
          <div className={helpClass}>The Drive folder holding the raw MP4 walkthrough clips for this inspection.</div>
        </div>
        <div>
          <label className={labelClass}>Move-in inspection report (Google Drive)</label>
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
