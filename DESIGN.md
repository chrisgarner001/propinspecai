---
# gstack: design-md-format=spec
name: PropInspec
description: An industrial, restrained review tool where every hard number reads as exact and checkable, so a reviewer can trust it before it reaches a tenant or owner.
colors:
  primary: "#A9791F"          # mustard/ochre — the inspector's grease pencil; primary actions + "pending review"
  on-primary: "#FFFFFF"
  surface: "#FFFFFF"
  background: "#F6F7F6"
  surface-alt: "#EEF0EE"
  border: "#DDE1DD"
  text: "#14171A"
  text-muted: "#6B7280"
  accent: "#A9791F"
  accent-ink: "#5C4212"
  accent-bg: "#FBF1DD"
  success: "#2F7D5C"          # Good condition / Approved
  success-bg: "#E7F3ED"
  warning: "#A9791F"           # shares the accent — "pending review" IS the warning state, no separate hue
  fair: "#B45309"              # Fair condition — distinct from accent: more saturated, more orange
  fair-bg: "#FDF0E4"
  error: "#B3261E"             # Damaged condition
  error-bg: "#FBEAE8"
  neutral: "#8A8F98"           # Not Rated condition
  neutral-bg: "#EFEFF1"
  brand-cyan: "#29BFEB"        # GPM logo mark only — never used in app chrome
  brand-indigo: "#3B2E8C"      # GPM logo mark only — never used in app chrome
typography:
  display:
    fontFamily: "Cabinet Grotesk"
    fontWeight: 700
    fontSize: "clamp(1.75rem, 1.4rem + 1.4vw, 2.5rem)"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "General Sans"
    fontSize: 1rem
    lineHeight: 1.5
  label:
    fontFamily: "General Sans"
    fontSize: 0.75rem
    letterSpacing: 0.04em
  mono:
    fontFamily: "JetBrains Mono"
    fontFeature: tnum
rounded:
  sm: 3px
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 48px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
  button-primary-hover:
    backgroundColor: "#8F6519"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    borderColor: "{colors.border}"
    rounded: "{rounded.sm}"
  input:
    borderColor: "{colors.border}"
    rounded: "{rounded.sm}"
  table-row-hover:
    backgroundColor: "{colors.surface-alt}"
  badge-pending-review:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent-ink}"
  badge-reviewed:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success}"
  badge-exported:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.neutral}"
  condition-fair:
    backgroundColor: "{colors.fair-bg}"
    textColor: "{colors.fair}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  nav-link:
    textColor: "{colors.text-muted}"
---

# PropInspec

## Overview

**Creative North Star:** An industrial, function-first review surface where every hard number is set in mono so it reads as exact, unedited, and checkable — the opposite feeling of a marketing dashboard.

**Product context:** PropInspec is GPM Property Management's internal tool for reviewing AI-generated move-out inspection reports before they reach a tenant or owner. Reviewers: Chuck (field inspector), Jessica Zilka (maintenance supervisor), Courtney (quoting). The AI extraction pipeline produces structured reports from inspection video; this dashboard is the required human review gate — nothing goes out unreviewed. GPM is the brand; PropInspec is "powered by" — the logo lockup always leads with the GPM mark.

**Mode per surface:** Inspections list = Operate (dense triage table). Inspection detail/review = Operate (structured data + photo evidence, one review decision per page). Cost Book = Operate (a working ledger, not a report).

**Reference sites:** Researched Stripe's and Linear's dense-table patterns (internal ops tools tolerate density; users are power users exploring, not first-time visitors) and the property-management inspection software landscape (zInspector/AppFolio) for category baseline, 2026-09-10.

**Key characteristics:**
- GPM logo is the primary brand anchor everywhere; "Powered by PropInspec" is a small secondary lockup, never the headline
- Dense data table as the default surface, not card mosaics
- Every measurement, GPS coordinate, timestamp, and dollar amount renders in tabular-figure mono
- Condition taxonomy (Good / Fair / Damaged / Not Rated — the actual `line_items.condition` enum) drives the only four semantic colors in the system
- Light mode only: this is reviewed at a desk during business hours

## Colors

**Strategy:** Restrained — one functional accent (ochre) plus neutrals; GPM's brand cyan/indigo are reserved for the logo mark itself and never bleed into app chrome, buttons, or data visualization. Keeping the two systems separate means a GPM rebrand or a new "Powered by" partner never forces a rework of the working UI.

**Light or dark:** Light only. This is reviewed at a desk, mid-shift, matching real paperwork and a well-lit office — not a developer tool used late at night.

Named rules: `accent` (ochre) carries both primary interactive actions AND the `pending_review` status badge — deliberately doubled, since "pending review" IS a call to action ("go look at this"). `success`/`fair`/`error`/`neutral` map 1:1 to the real `line_items.condition` enum (Good/Fair/Damaged/Not Rated) — never invent a fifth condition color, and never reuse these four for anything else. `fair` is a distinct saturated orange, not a lighter version of `accent` — the two must stay visually separable since both can appear on the same row. Neutrals (`background`, `surface`, `surface-alt`, `border`) are all cool slate-grays derived from the same hue as `text`, never mixed warm/cool.

## Typography

Cabinet Grotesk and General Sans (Fontshare, same foundry — coheres as a family) cover the interface: Cabinet Grotesk's slightly architectural, precise geometry carries headings and nav labels; General Sans, built for UI, carries body copy and dense table cells at small sizes without going mushy. JetBrains Mono (Google Fonts) carries every hard number — this is the one deliberate typographic risk in the system: measurements, GPS coordinates, timestamps, and dollar amounts are ALWAYS mono with tabular figures, even inline in a sentence, so a reviewer's eye learns to trust mono text as "this came straight from the source, unedited."

Loading: `<link>` to Fontshare's CSS API for Cabinet Grotesk (700/500) + General Sans (400/500/600); Google Fonts `<link>` for JetBrains Mono (400/500/700).

Scale: display uses a fluid clamp so page titles don't reflow awkwardly between the table view and the detail view; body stays fixed at 16px (never smaller, per accessibility floor); labels stay at 12px uppercase with tracking for scannability in table headers.

## Layout

Grid-disciplined. Two-column app shell: a narrow (200px) nav rail and a flexible main content area — no dashboard-card mosaic. The inspections list is a single dense table, 36-44px rows, no zebra striping (hover state carries row emphasis instead). Detail/review views break the grid intentionally: a fixed-width evidence frame (280px) sits beside flowing review notes, because photo evidence needs a stable frame while notes vary in length.

## Elevation & Depth

Borders, not shadows. A 1px `border` token separates every surface (nav rail from content, table rows, cards, evidence frames). The one exception is the theme toggle / floating controls, which may use a small offset+blur shadow to read as "floating above" the page — everything else is flat.

## Shapes

Two radii only: `sm` (3px) for buttons, inputs, and badges; `lg` (8px) for the app shell and evidence frames. No radius on table rows or dividers. Never a bubbly uniform radius across unrelated element types.

## Components

- **button-primary**: ochre fill, white text, `sm` radius. Hover darkens ~10%. This is the only solid-fill button — everything else is bordered or ghost.
- **badges** (pending_review/reviewed/exported): tinted background + matching text color, no border, small dot indicator. These map 1:1 to `inspections.status` — a separate vocabulary from the per-line-item Good/Fair/Damaged/Not Rated condition dots.
- **table rows**: no default background; `surface-alt` tint on hover only. Never disable hover — this is a scanning surface.
- **evidence frame**: photo + a mono caption bar baked into the frame (GPS + timestamp), border-only, no shadow. This is the one component built specifically to serve the "trustworthy evidence" north star — never reduce it to a plain unlabeled image.
- **inputs**: bordered, `sm` radius, mono font specifically for any field holding a measurement or coordinate.

## Do's and Don'ts

- Do: put every measurement, coordinate, timestamp, and dollar amount in mono with tabular figures, everywhere it appears — table cells, detail views, even inline text
- Do: lead every screen's brand lockup with the GPM logo; "Powered by PropInspec" stays secondary and small
- Do: keep the four condition colors (Good/Fair/Damaged/Not Rated) reserved exclusively for condition state — never reuse green/orange/red/gray for anything else
- Do: default every screen to light mode
- Don't: introduce GPM's brand cyan/indigo into buttons, links, charts, or any functional UI — they live in the logo mark only
- Don't: wrap the inspections list in dashboard cards or stat tiles — it's a table, not a summary view
- Don't: add a second accent color; the ochre accent already does double duty (primary action + `pending_review` badge) on purpose
- Don't: use a plain `<img>` lightbox for inspection photos — always the evidence-frame component with its mono caption

## Motion

- **Approach:** minimal-functional — motion only where it aids comprehension (a row expanding, a status changing), never decorative
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50-100ms) short(150-250ms) medium(250-400ms)
- **The one authored moment:** a status badge transition (pending_review → reviewed/exported) briefly scales and settles, so a reviewer's action registers as confirmed without a toast notification

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-10 | Initial design system created | Created by /design-consultation: Industrial/Utilitarian direction, ochre accent, Good/Damaged/N/A semantic colors, Cabinet Grotesk + General Sans + JetBrains Mono, informed by Stripe/Linear dense-table research and the existing Zinspector report taxonomy |
| 2026-09-10 | GPM logo made primary brand anchor, product renamed PropInspecAI → PropInspec | User decision: GPM is the brand; PropInspec drops "AI" from its name and appears as a secondary "Powered by" lockup, never the headline |
| 2026-09-10 | Condition palette corrected to 4 states (added `fair`) | The real `line_items.condition` check constraint is Good/Fair/Damaged/Not Rated, not the 3-state Good/Damaged/N/A assumed from the old Zinspector report during the design pass — found while implementing the real inspections list against the actual schema |
| 2026-09-10 | Inspections list restructured: grouped by status, Condition column dropped, "Add New Inspection" added | User decision: the overview page is for triage-by-status, not a condition summary; condition detail belongs on the detail page |
| 2026-09-10 | Line-item edits are bulk-saved (one "Save all changes" button), not per-row | User decision: removed per-row Save buttons in favor of a single page-level submit — the review is one editing session, not N independent ones |
| 2026-09-10 | Outside-vendor assignment is a link-styled `<select>`, not a modal | Native select styled as an ochre underlined link satisfies "click to pick a vendor" without new client-side state; vendors table (ACME 1/2/3 seed) added |
| 2026-09-10 | `still_image_file` column added to line_items, hover-preview built ahead of the extraction pipeline | UI and data model ready for when the video-still-extraction step (see docs/designs) lands; renders "No still extracted yet" until then |
| 2026-09-10 | Export gets a real file: `/inspections/[id]/export` route generates an .xlsx via exceljs | Column set is a placeholder pending Courtney's actual rehab-quote template (still not obtained per the design doc's own Open Questions) |
| 2026-09-10 | Line-item table widened to fit without horizontal scroll (AppShell `wide` prop, dropped forced `min-w`) | User feedback: dense 8-column table shouldn't require side-scrolling on a normal desktop viewport |
| 2026-09-10 | Inspection status toggle: "Mark Exported" button becomes "Under Review" once exported, reverting status to `pending_review` | User decision: reviewers need a way back from Exported without a separate admin action |
| 2026-09-10 | "Create Move Out Report" generates a PDF via pdfkit at `/inspections/[id]/move-out-report`, structured to match `Blank Move In Checklist.pdf` (GPM letterhead, Property/Tenant/Date/Type block, per-room Item/Status/Comments table, signature block) | Michigan law requires the move-out checklist to match the move-in checklist's structure (MCL 554.608 family). Two things deliberately NOT guessed: (1) the statutory notice paragraph — the move-in form's notice text is move-in-specific; move-out text differs and wasn't supplied, so it's a marked placeholder pending counsel review; (2) Tenant Names — `inspections` has no tenant_name column, left blank rather than fabricated. Condition display maps Damaged→"Poor" and Not Rated→blank to match the checklist's Good/Fair/Poor scale |
| 2026-09-10 | Still images are actually extracted from real video via ffmpeg (`scripts/extract-stills.mjs`, midpoint of `source_timestamp`) | Local `public/stills/` copy kept for dev convenience only (gitignored); the source of truth is Supabase Storage (see next row) |
| 2026-09-10 | Reversed: stills upload to a **public** Supabase Storage bucket (`inspection-stills`), `still_image_file` stores the public URL directly — works identically local and on Vercel, no signed URLs, no auth | User correction: these are GPM's own post-move-out evidence photos of a now-vacant unit, not restricted tenant data — the earlier "keep it gitignored/local-only" caution was miscalibrated to this case. `scripts/lib/supabase-admin.mjs` creates the bucket; `scripts/migrate-stills-to-storage.mjs` moved the first 8 already-extracted stills over. Needs `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `dashboard/.env.local` (local script use only, not read by the deployed app) |
| 2026-09-10 | Set Up page added (GPM Labor Charge $/hr, Material Markup %, Vendor Markup %), backed by a singleton `settings` table | User request. Only `gpm_labor_charge` is wired into a calculation so far (see next row); the two markup percentages are stored but not yet applied anywhere |
| 2026-09-10 | Labor on a line item is entered as **hours** (0.25 increments), not a dollar amount — `labor_cost = labor_hours * settings.gpm_labor_charge`, computed and stored at save time by `bulkUpdateLineItems` | User correction: the earlier "0.25 increments" spec was for hours, which I'd misread as a dollar step. Stored (not computed on read) so a later rate change doesn't silently alter past reports. `LaborHoursInput` (client component) shows a live `hours × rate` preview before save |
| 2026-09-10 | Move-Out Report's Itemized Charges table shows the `hours @ $rate/hr` breakdown under the Labor $ figure, not just the total | User request: "the charges ... needs to reflect the calculation" — an auditable breakdown, not just a number |
| 2026-09-10 | Fixed: inspection-detail line-item grid columns desynced from their headers | Root cause: `ROW_COLS` used bare `Nfr` grid tracks; since each row is an independent `display:grid` container, a row whose Item cell held a long unbroken string (the full Supabase Storage still-image URL) had its Item track's min-content forced wider than its fr share, pushing that row's other columns right relative to the header row (which has short text and stayed put). Fixed with `minmax(0,Nfr)` on every track plus `min-w-0` on each cell div (grid items default to `min-width:auto` independent of track sizing) and `break-all` on the still-image label. Also switched the label itself from the full URL to just the filename — more readable and a smaller belt-and-suspenders fix |
| 2026-09-10 | Every line-item field is now inline-editable in the bulk-save form — Room/Area, Item, Recommended Action, Observed Evidence, Source Timestamp as text inputs; Condition and Assigned To as selects | User request: "everything ... with exception of Image and Mp4 file name" — `still_image_file` (EvidenceStill) and `source_video_file` stay plain text/display, nothing else does |
| 2026-09-10 | Assigned To gained a third option, "Other" (`line_items_assigned_to_check` constraint updated) | User request. The vendor picker (`VendorSelect`) now only shows when the *currently stored* Assigned To is "Outside Vendor" — changing the dropdown and saving is a two-step reveal (no client JS reactivity added for this), same pattern as the Materials/Labor/Vendor-Est. disabled states |
| 2026-09-10 | Inspection status is edited via the status pill itself (`StatusSelect`, a client component, auto-submits `updateInspectionStatus` on change) — the separate "Mark Exported"/"Under Review" buttons are gone | User request. Replaces the two-state toggle with a direct 3-way select (Pending review / Reviewed / Exported); `StatusBadge`'s style map is now exported and shared so the pill and the read-only list-page badge stay visually identical |
| 2026-09-10 | "Duplicate Section" button, bottom-right of each line item, inserts a copy directly below it | `duplicateLineItem(id, inspectionId)` bound via `.bind()` as the button's `formAction` (NOT a `name`/`value` pair on the button — that collides with Next.js's own `$ACTION_ID_...` encoding for function-valued `formAction`s and produces a hydration-mismatch error). New row's `created_at` = original's + 1ms, so it sorts immediately after the original under the existing `order by room_area, created_at` |
| 2026-09-10 | "Tenant Status" renamed "Tenant Charge"; the Charge/Approved radios became two bare checkboxes with no text | `TenantChargeCheckboxes` (client component) renders two independent-looking `<input type="checkbox">`s but keeps them backed by one hidden input / one DB column (`tenant_status` still only holds `tenant_charge` \| `approved` \| null) — checking one clears the other in local state, submitted as a single value |
| 2026-09-10 | "Download Excel" replaced by "Create Turn Scope" — creates a **real Google Sheet** (not a downloaded file), matching the structure of GPM's `Turn Scope - 19946 Kinloch....xlsx` reference (bold-bordered Area/Details/Comments/Vendor-GPM/Hours/Stage table, running-hours-total formula, VendorsEstimates tab), and drops it directly into the matching property folder on GPM's shared Drive | User-provided a service-account key (`GOOGLE_SERVICE_ACCOUNT_JSON` env var, same pattern as `DATABASE_URL` — works locally and on Vercel; never read the local `google-service-account.json`/`gpm-propinspec-*.json` files directly, both gitignored). **Real bug hit and fixed:** `sheets.spreadsheets.create` always tries to create in the caller's own Drive space; modern service accounts have zero personal storage quota there and get a 403 ("The caller does not have permission") no matter what scopes/roles are granted. Fixed by creating the file directly inside the target Shared Drive folder via `drive.files.create({parents:[folderId]})`, then populating it with `spreadsheets.batchUpdate` (`updateCells`/`mergeCells`/`updateBorders`) instead. Property folders are matched by a drive-wide name search (`"<street name> <street number>"`, e.g. "Brest 1554") across both Shared Drives ("Property Files A-O" / "Property Files P-Z", further split by street-name letter range one level down — searched with `corpora:'drive'` and no parent filter so the letter-range nesting doesn't matter); a folder that isn't found returns a clear error rather than guessing a location. `lib/google.ts` holds the shared auth + folder-lookup helpers |
| 2026-09-10 | Video clips are now playable from the detail page: filename is a link opening a popup with a Drive preview `<iframe>` | Videos upload to Drive (`scripts/upload-videos.mjs`) into a dedicated "Inspection Videos" subfolder inside the property's folder — NOT Supabase Storage. **Real limit hit:** a real 162MB clip 413'd against Supabase Storage's project-wide default 50MB upload cap (a project setting, not something the app can raise); Drive has no comparable low default, so clips up to ~260MB uploaded fine. The subfolder keeps raw clips separate from the property folder's existing long-lived document archive (real work orders, water bills, tax records — confirmed by listing it). The popup embeds Drive's own `/preview` iframe rather than a direct `<video src>`: Drive doesn't serve raw bytes for that without making the file public, and unlike the stills (confirmed OK to be public — tenant moved out), full walkthrough video is left behind Drive's real permissions, so only a signed-in GPM Drive member can actually play it |
| 2026-09-10 | `source_timestamp` removed from the UI entirely (no longer editable, no longer touched by `bulkUpdateLineItems`'s UPDATE at all) | User request, superseded by the video popup — existing values are preserved untouched in the DB (just orphaned/unused) rather than nulled out by a save that no longer submits that field |
| 2026-09-10 | VendorSelect's placeholder option text removed ("— select vendor —" → blank) | User request. The option itself (empty value) stays — needed so an Outside-Vendor row with no vendor chosen yet still has a valid unselected state to save as null |
| 2026-09-10 | "Create New Vendor" added to Set Up (with the current vendor list shown above it) | User request — `vendors` had no UI to add to it beyond the 3 seeded placeholders |
