# TODOS

## Infrastructure

### Retroactive test coverage for existing PropInspec code

**What:** Add automated tests for everything shipped before the Job Timeline PR — `bulkUpdateLineItems`, `duplicateLineItem`, `addLineItem`, Turn Scope Google Sheet generation, Move Out Report PDF generation, the inspection detail page, Cost Book, Setup.

**Why:** This repo has zero automated tests (no framework config, no test script, 0 test files) despite handling live financial data (materials costs, vendor estimates, tenant charges) in active production use. The Job Timeline PR (2026-09-11) adds Vitest and tests its own new code only — the rest of the app stays untested.

**Context:** Vitest gets configured as part of the Job Timeline PR, so the tooling setup cost is already paid — this TODO is purely about writing tests for existing code, incrementally, one action/route at a time. Start with `bulkUpdateLineItems` (the highest-traffic action, touches every cost field) and the Turn Scope/Move Out Report generation routes (real external-facing documents with legal/financial consequences if wrong).

**Effort:** L
**Priority:** P2
**Depends on:** Job Timeline PR landing (Vitest setup)

## Design

### Revisit dependency visualization if the text indicator proves insufficient

**What:** The Job Timeline shows `blocks_line_item_id` dependencies as a small "← blocked by: X" text indicator (hover/click to highlight the predecessor bar), not a drawn connector graph.

**Why:** A drawn line only had a defined look for the trivial same-row/adjacent-time case; real dependencies are routinely cross-room and cross-time, which would need real routing/z-index/scroll work nobody has scoped. The text indicator sidesteps that entirely and is plenty at GPM's current scale (small per-inspection item counts).

**Context:** Surfaced in /plan-design-review 2026-09-11. Revisit only if real usage on a turn with many chained dependencies makes "click each item to find its blocker" genuinely tedious — no evidence yet that this will happen. Speculative, not urgent.

**Effort:** M
**Priority:** P4
**Depends on:** Job Timeline shipping and seeing real multi-dependency usage

## Video Processing

### Automatic in-app video chunking

**What:** Split one long video into segments processed across multiple requests,
removing the ~400MB pre-flight size ceiling entirely.

**Why:** Today, a video over ~400MB must be re-shot or manually split by the inspector
before upload; this would remove that constraint in-app.

**Context:** Deferred during the 2026-09-24 large-video plan-eng-review because the
shoot-shorter-clips workaround already covers it at zero engineering cost, and the
existing per-video polling loop (`VideoProcessingPanel.tsx` + `inspection_videos`'
pending/processing/done/failed state machine) already provides equivalent behavior for
separately-shot clips. Worth building only if real GPM usage shows the manual workaround
is a recurring pain — not speculative work.

**Effort:** L
**Priority:** P4
**Depends on:** None

### Zero-disk-footprint video streaming

**What:** Make Gemini upload + ffmpeg operate directly on a stream/URL, never touching
local `/tmp`, to raise the safe video-size ceiling closer to Gemini's real 2GB
Files API cap.

**Why:** The ~400MB threshold is set by Vercel's real, measured ~512MB `/tmp` capacity
(confirmed live 2026-09-24 via a temporary diagnostic route against production —
`statfs` reported ~513MB available, writes failed with `ENOSPC` past 512MB), not by
Gemini's own 2GB per-file limit. Removing the `/tmp` dependency could support roughly
5x larger videos.

**Context:** Real, unconfirmed engineering risk — the installed `@google/genai` SDK's
`uploadFile(file: string | Blob, ...)` (node_modules/@google/genai/dist/node/node.d.ts:454)
doesn't document Readable-stream support, and ffmpeg's seek behavior (`-ss` + frame
extraction) on a live stream/URL needs its own real verification before committing to
it. Don't start this speculatively — confirm SDK/ffmpeg streaming support first.

**Effort:** L
**Priority:** P4
**Depends on:** Confirming SDK/ffmpeg streaming support first
