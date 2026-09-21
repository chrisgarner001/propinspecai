import Anthropic from '@anthropic-ai/sdk'

// Model configurable via env var, matching lib/gemini.ts's own convention --
// picking a slightly-wrong current id shouldn't require a code change.
const MODEL = process.env.ANTHROPIC_HELP_MODEL || 'claude-haiku-4-5'

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set')
  return new Anthropic({ apiKey })
}

const SYSTEM_PROMPT = `You are the in-app help assistant for PropInspec, GPM Property Management's move-out inspection dashboard. You're talking to Jessica or another GPM staff reviewer who is actively using the app right now.

Answer two kinds of questions:
1. "How do I..." / "where is..." workflow questions -- answer from the app reference below.
2. "Why does this show..." questions about the specific data on their current screen -- answer using the page data provided below, if any was matched for this page.

Rules:
- Be direct and brief. This is a busy reviewer mid-task, not someone reading documentation for fun.
- If page data was provided, use the REAL numbers/values in it -- never make up a total, a name, or a status.
- If no page data was matched for this page, or the question needs data that wasn't included, say so plainly and suggest what to check, rather than guessing.
- If you don't know the answer, say so. Don't invent a feature that doesn't exist.`

// Written from scratch (2026-09-21) -- no existing docs/FAQ corpus exists
// anywhere in this app to draw from. Keep this current when a page's real
// behavior changes; it's the only source of workflow-help content the
// assistant has.
const APP_REFERENCE = `## Inspections list (/)
The homepage. Every move-out inspection, one row per job. Click a row to open its detail page.

## Inspection detail page (/inspections/[id])
Header: property address, job #, inspector, date, and the Status pill (top right -- click to change status). Below: Tenant Chargeback Review and Quote and Schedule buttons. Once status reaches Approved, more buttons appear: Dispatch Board, Create Stages, Stage View, Materials Order List, Create Quote.
Source videos link + View Image Folder + Video Processing controls sit together above the line-item table. The table itself (Item / Condition / Remove from Quote Sheet) is read-only for Area and cost fields now -- those live on the Quote Sheet page instead. "Add a line item" at the bottom manually adds a new inspected item.

## Quote Sheet (/inspections/[id]/quote-sheet)
The main cost-editing screen. Top bar shows running $ materials total and labor-hours total for the whole inspection. "Bulk Materials" section (top) is for one purchase used across many line items (e.g. a contractor pack of outlets) -- each has its own Edit/Delete, and a "Cost" field for the whole purchase.
Each line item's row: Area/Details/Comments/Vendor-GPM assignment/Vendor Quote/Stage on top, then a "Total: $X.XX" plus Remove Section/Duplicate, then the "Materials for Above Section" box below -- Supplier/SKU/Qty for the primary item, a "Choose bulk item" dropdown that fills it instantly, Materials $/Labor (hrs) fields (only editable when assigned to GPM Staff, not an Outside Vendor), and an "Add Item" button that reveals a matching blank box for a second item on the same line, and so on for a third, etc. Every item's Materials $/Labor (hrs) count toward that row's Total.
"Create Stages" groups approved items into batches by Stage+Assignee for dispatch. "Stage View" shows those batches grouped for review/Take-Off Sheets. "Materials Order List" is a shopping-list PDF grouped by supplier. "Create Quote" is the owner-facing PDF.

## Stage View (/inspections/[id]/quote-sheet/stages)
Read-only grouped view of the Quote Sheet's batches, one section per Stage+Assignee. Each has a "Take-Off Sheet" PDF link (scope of work for whoever's doing that batch, no cost info).

## Dispatch Board (/dispatch-board)
Portfolio-wide calendar across all approved jobs, not just one inspection. Drag Stage cards onto dates to schedule. Toggle between By Property and By Crew views.

## Image Folder (/inspections/[id]/stills)
Every still photo extracted from the inspection video, grouped by room. "Share Images" lets you check specific photos and generate a public link (no login needed) to send to an owner or tenant -- click Create Image Library Link, it copies automatically.

## Tenant Chargeback Review (/inspections/[id]/chargeback-review)
Decide which items are the tenant's financial responsibility and the $ amount to charge them, separate from the repair/materials workflow.

## Cost Book (/cost-book)
GPM's own reference pricing -- GPM Labor rates, Materials pricing, and placeholder Vendor Estimates. Not the same as any one job's actual costs; it's a lookup reference.

## Setup (/setup)
Admin pages: the Stage catalog (add/reorder/rename the stages jobs get batched into), and other configuration.`

export type HelpMessage = { role: 'user' | 'assistant'; content: string }

// Confirmed live pattern from lib/gemini.ts: retry transient overload/
// rate-limit errors with backoff rather than failing the whole request.
async function createMessageWithRetry(client: Anthropic, params: Anthropic.MessageCreateParamsNonStreaming) {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.messages.create(params)
    } catch (err) {
      const retryable = err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError
      if (!retryable || attempt === maxAttempts) throw err
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  throw new Error('unreachable') // satisfies TS control-flow analysis; loop always returns or throws
}

// pageData is a pre-summarized snapshot from lib/helpContext.ts for the
// reviewer's current URL, or null when the route isn't mapped yet (the
// assistant still answers workflow questions from APP_REFERENCE either way).
export async function askHelpAssistant(
  question: string,
  history: HelpMessage[],
  pageData: string | null
): Promise<string> {
  const client = getClient()

  const contextBlock = pageData
    ? `## Data currently on the reviewer's screen\n\n${pageData}`
    : `## Data currently on the reviewer's screen\n\n(No page-specific data is available for this screen yet -- answer workflow questions only, and say so if asked about specific numbers here.)`

  const response = await createMessageWithRetry(client, {
    model: MODEL,
    max_tokens: 1024,
    system: `${SYSTEM_PROMPT}\n\n${APP_REFERENCE}\n\n${contextBlock}`,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: question },
    ],
  })

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  return textBlock?.text ?? "I couldn't come up with an answer to that -- try rephrasing."
}
