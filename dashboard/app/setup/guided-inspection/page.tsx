import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import {
  updateGuidedInspectionSettings,
  createChecklistItem,
  updateChecklistItem,
  removeChecklistItem,
  moveChecklistItem,
} from '@/app/actions'
import AppShell from '@/app/components/AppShell'
import DeleteInspectionButton from '@/app/components/DeleteInspectionButton'

export const dynamic = 'force-dynamic'

type TypeRow = { id: string; name: string; guided_inspection_required: boolean }
type ItemRow = { id: string; label: string; help_text: string | null; kind: string }

const KIND_LABELS: Record<string, string> = {
  text_photo: 'Answer + photo',
  text: 'Answer only',
  photo: 'Photo only',
}

const sectionTitle = 'font-medium'
const helpClass = 'text-[12px] text-text-muted mt-1'
const smallLabel = 'block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1'
const fieldClass = 'border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface'
const ghostButton =
  'bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap'

function OnOffRadios({ name, on }: { name: string; on: boolean }) {
  return (
    <div className="flex items-center gap-4 text-[13px]">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input type="radio" name={name} value="on" defaultChecked={on} className="accent-accent" /> On
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input type="radio" name={name} value="off" defaultChecked={!on} className="accent-accent" /> Off
      </label>
    </div>
  )
}

// Design: docs/designs/propinspec-guided-inspection.md
export default async function GuidedInspectionSetupPage() {
  await requireAdmin()
  const sql = getSql()
  const [settings] = await sql`select guided_inspection_required from settings where id = true`
  const masterOn = !!settings?.guided_inspection_required
  const types = (await sql`
    select id, name, guided_inspection_required from inspection_types order by (name = 'Move-Out') desc, name
  `) as unknown as TypeRow[]
  const items = (await sql`
    select id, label, help_text, kind from checklist_items where active order by sort_order, created_at
  `) as unknown as ItemRow[]

  return (
    <AppShell active="/setup" title="System Config — Guided Inspection">
      <div className="p-4 md:p-6 max-w-2xl space-y-8">
        <section>
          <div className={sectionTitle}>Overview</div>
          <div className="text-[13px] leading-relaxed mt-1 space-y-2">
            <p>
              Guided Inspection gives the inspector a step-by-step page on the iPad, opened before the walkthrough
              video is recorded. It makes sure every inspection captures the same core information, and it gives
              the AI a fixed list of room names so rooms are never mislabeled in the report.
            </p>
            <p>On site, the inspector works through four steps:</p>
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>
                <span className="font-semibold">Rooms</span>: lists every room in the house (Bedroom 1, Bedroom 2,
                Kitchen…). These become the only room names the report uses.
              </li>
              <li>
                <span className="font-semibold">Checklist</span>: answers and photographs the items below (lockbox,
                meters, panel, furnace…).
              </li>
              <li>
                <span className="font-semibold">Room photos</span>: one wide still per room.
              </li>
              <li>
                <span className="font-semibold">Walkthrough</span>: records the video with the camera as today,
                naming each room aloud, uploads it to the Drive folder, and marks the field inspection complete.
              </li>
            </ol>
          </div>
        </section>

        <section>
          <div className={sectionTitle}>General instructions</div>
          <ul className="text-[13px] leading-relaxed mt-1 list-disc pl-5 space-y-0.5">
            <li>
              Give each inspector a login with the <span className="font-semibold">Inspector</span> access level in
              Manage Users and link it to their name. Inspectors only see their own assigned inspections and none of
              the office pages.
            </li>
            <li>
              On the iPad, the inspector signs in at the usual PropInspec address in Safari. Tip: Share → Add to Home
              Screen makes it open like an app.
            </li>
            <li>
              An inspection is assigned to an inspector through the Inspector field on Add New Inspection.
            </li>
            <li>
              When Guided Inspection is required for an inspection&apos;s type, its videos can&apos;t be processed
              until the inspector marks the field inspection complete. When it isn&apos;t required, the field steps
              are still available and still used if filled in.
            </li>
            <li>Checklist photos are stored privately. They&apos;re only visible to signed-in users, never in share links.</li>
          </ul>
        </section>

        <form action={updateGuidedInspectionSettings} className="space-y-5">
          <section className="border border-border rounded-[var(--radius-lg)] bg-surface p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className={sectionTitle}>Require Guided Inspection</div>
                <div className={helpClass}>
                  Master switch. When off, nothing is required for any inspection type, whatever is set below.
                </div>
              </div>
              <OnOffRadios name="master" on={masterOn} />
            </div>
          </section>

          <section>
            <div className={sectionTitle}>Inspection types</div>
            <div className={`${helpClass} mb-2`}>
              Turn on the types that require Guided Inspection. Applies only while the master switch is on.
            </div>
            <div className="border border-border rounded-[var(--radius-lg)] divide-y divide-border bg-surface">
              {types.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="text-[13px] font-medium">{t.name}</span>
                  <OnOffRadios name={`type__${t.id}`} on={t.guided_inspection_required} />
                </div>
              ))}
            </div>
          </section>

          <button
            type="submit"
            className="bg-accent hover:bg-accent-hover text-white rounded-[var(--radius-sm)] px-4 py-2 text-[13px] font-semibold"
          >
            Save
          </button>
        </form>

        <section>
          <div className={sectionTitle}>Checklist items</div>
          <div className={`${helpClass} mb-2`}>
            What the inspector captures in step 2, in this order. An item counts as done once the inspector adds a note or
            a photo, so &quot;None&quot; completes an item that doesn&apos;t apply. Removing an item hides it from new
            inspections; answers already captured stay on their inspections. The wide photo of every room is step 3,
            built from the room list, so it isn&apos;t listed here.
          </div>
          <div className="border border-border rounded-[var(--radius-lg)] divide-y divide-border bg-surface mb-4">
            {items.length === 0 && <div className="px-4 py-3 text-[13px] text-text-muted italic">No checklist items.</div>}
            {items.map((item, i) => (
              <div key={item.id} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{item.label}</div>
                    <div className="text-[11px] text-text-muted truncate">
                      {KIND_LABELS[item.kind] ?? item.kind}
                      {item.help_text ? ` · ${item.help_text}` : ''}
                    </div>
                  </div>
                  <form action={moveChecklistItem.bind(null, item.id, 'up')}>
                    <button type="submit" disabled={i === 0} aria-label={`Move ${item.label} up`} className={`${ghostButton} disabled:opacity-30`}>
                      ↑
                    </button>
                  </form>
                  <form action={moveChecklistItem.bind(null, item.id, 'down')}>
                    <button
                      type="submit"
                      disabled={i === items.length - 1}
                      aria-label={`Move ${item.label} down`}
                      className={`${ghostButton} disabled:opacity-30`}
                    >
                      ↓
                    </button>
                  </form>
                  <DeleteInspectionButton
                    action={removeChecklistItem.bind(null, item.id)}
                    label="Remove"
                    confirmMessage={`Remove "${item.label}" from the checklist? Answers already captured are kept.`}
                  />
                </div>
                {/* Plain <details>: an inline edit form with no client JS. */}
                <details className="mt-1">
                  <summary className="text-[12px] font-semibold text-accent cursor-pointer w-fit">Edit</summary>
                  <form
                    action={updateChecklistItem.bind(null, item.id)}
                    className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_auto_auto] gap-2 items-end mt-2"
                  >
                    <div>
                      <label className={smallLabel}>Item</label>
                      <input name="label" required defaultValue={item.label} className={fieldClass} />
                    </div>
                    <div>
                      <label className={smallLabel}>Instructions</label>
                      <input name="help_text" defaultValue={item.help_text ?? ''} className={fieldClass} />
                    </div>
                    <div>
                      <label className={smallLabel}>Capture</label>
                      <select name="kind" defaultValue={item.kind} className={fieldClass}>
                        {Object.entries(KIND_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="submit" className={`${ghostButton} py-2`}>
                      Save
                    </button>
                  </form>
                </details>
              </div>
            ))}
          </div>

          <form action={createChecklistItem} className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr_auto_auto] gap-2 items-end">
            <div>
              <label className={smallLabel}>Item</label>
              <input name="label" required placeholder="e.g. Sump pump" className={fieldClass} />
            </div>
            <div>
              <label className={smallLabel}>Instructions (optional)</label>
              <input name="help_text" placeholder="e.g. Test it runs; photo of the pit." className={fieldClass} />
            </div>
            <div>
              <label className={smallLabel}>Capture</label>
              <select name="kind" defaultValue="text_photo" className={fieldClass}>
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={`${ghostButton} py-2`}>
              Add Item
            </button>
          </form>
        </section>
      </div>
    </AppShell>
  )
}
