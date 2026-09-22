import { getSql } from '@/lib/db'
import { requireAdmin } from '@/lib/dal'
import { createStage, updateStageName, moveStageUp, moveStageDown } from '@/app/actions'
import AppShell from '@/app/components/AppShell'

export const dynamic = 'force-dynamic'

type Stage = { id: string; name: string; sort_order: number }

const fieldClass = 'border border-border rounded-[var(--radius-sm)] px-2.5 py-1.5 w-full bg-surface'
const orderButtonClass =
  'border border-border rounded-[var(--radius-sm)] px-2 py-1 text-[12px] bg-surface hover:bg-surface-alt disabled:opacity-30 disabled:hover:bg-surface'

// Stages are a fixed, orderable catalog (Clean Out, Paint, Plumbing, ...)
// that replaces both the old unused free-text quote_stage column and the
// Quote Sheet's manually-typed batch number -- see 0019_stages.sql. The
// order set here is the order they appear in every Stage dropdown and
// summary across the app (Quote Sheet, Stage View, Job Timeline).
export default async function StagesSetupPage() {
  await requireAdmin()
  const sql = getSql()
  const stages = (await sql`select id, name, sort_order from stages order by sort_order`) as unknown as Stage[]

  return (
    <AppShell active="/setup" title="System Config — Stages">
      <div className="p-4 md:p-6 max-w-xl">
        <div className="font-medium">Stages</div>
        <div className="text-[12px] text-text-muted mt-1 mb-3">
          The rehab/turn stages available on the Quote Sheet and Job Timeline. Order here is the order they appear in
          every Stage dropdown.
        </div>

        <div className="space-y-2 mb-6">
          {stages.map((stage, i) => (
            <div key={stage.id} className="flex items-center gap-2">
              <div className="flex flex-col gap-0.5">
                <form action={moveStageUp.bind(null, stage.id)}>
                  <button type="submit" disabled={i === 0} className={orderButtonClass} aria-label={`Move ${stage.name} up`}>
                    ↑
                  </button>
                </form>
                <form action={moveStageDown.bind(null, stage.id)}>
                  <button
                    type="submit"
                    disabled={i === stages.length - 1}
                    className={orderButtonClass}
                    aria-label={`Move ${stage.name} down`}
                  >
                    ↓
                  </button>
                </form>
              </div>
              <span className="data-mono text-[11px] text-text-muted w-5 text-right">{i + 1}</span>
              <form action={updateStageName.bind(null, stage.id)} className="flex-1 flex items-center gap-2">
                <input name="name" required defaultValue={stage.name} className={fieldClass} />
                <button
                  type="submit"
                  className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap"
                >
                  Save
                </button>
              </form>
            </div>
          ))}
        </div>

        <form action={createStage} className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
              New Stage Name
            </label>
            <input name="name" required className={fieldClass} />
          </div>
          <button
            type="submit"
            className="bg-surface border border-border hover:bg-surface-alt rounded-[var(--radius-sm)] px-3 py-2 text-[12px] font-semibold whitespace-nowrap"
          >
            Add Stage
          </button>
        </form>
      </div>
    </AppShell>
  )
}
