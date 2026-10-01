# Design: Guided Inspection (field view)

Status: v1 built and QA'd locally at iPad size (2026-10-01); not yet released. Source: the 9355 Sylvia audit meeting (Chris, Jessica, Courtney — `reports/Inspection Audit/9355 Sylvia/`, 2026-09-30).

## Problem

The video-only pipeline leaves structure to the AI, and the Sylvia audit showed where that breaks:

- Room names drift ("Bedroom 3" → "Bedroom" across a split-segment seam).
- Every inspection today captures items GPM relies on for years of maintenance history — lockbox code, utility meter locations and readings (water meter specifically), electrical panel stills, furnace type — and nothing guarantees the video covers them.
- Wide room stills pulled from video are poor; quoting works best from real still photos (Jessica: "still images really tell the best picture").

## Decisions (Chris, 2026-10-01)

| Question | Decision | Why |
|---|---|---|
| Video capture | **Keep the phone camera** in v1. Video still goes to the Drive folder as today. | A 45-minute 4K upload from an iPad browser is the most failure-prone piece; it waits for v2. |
| Room list | **Inspector sets rooms up front.** | Those names become the *only* names the AI may use — the structural fix for room-label drift. |
| Checklist | **Editable in Setup**, seeded with the meeting's items. | Jessica's list will grow ("whatever else we add to that structure"). |
| Login | **New `Inspector` role.** | A field iPad shouldn't expose quotes, costs, tenant charges, or setup. |
| Requirement | **System Config → Guided Inspection**: overview + instructions, a master "Require Guided Inspection" switch, and an On/Off per inspection type. Enforced (video processing blocked until the field steps are marked complete) only when both are on; both default off. | Chris, 2026-10-01: roll it out per inspection type, not all at once. |
| Starter checklist | Chris's list: gas meter, water meter, electrical panel, lockbox (each location + photo), outside AC condenser, furnace, hot water tank, city inspection tags/notices, exterior front/side/rear, garage or outbuilding, exterior overgrowth or damage. "Wide photo of every room" is step 3, from the room list. An item is done once it has a note OR a photo, so "None" completes it. | Admins can add, edit, reorder, and remove items in the same Setup page. |

## Flow (one page per inspection, top to bottom)

1. **Rooms** — tap to add: Bedroom/Bathroom auto-number (Bedroom 1, 2, 3…); Kitchen, Living Room, etc. are single; a custom name is allowed.
2. **Checklist** — each item takes a text answer, a photo, or both (per item, set in Setup).
3. **Room photos** — one wide still per room from the room list.
4. **Record the walkthrough** — instructions: record with the camera, say each room's name exactly as listed, upload to the inspection's Drive folder. "Mark field inspection complete" stamps `inspections.field_completed_at`.

## Data model (migration 0041, applied 2026-10-01)

- `users.role` gains `'Inspector'`; `users.inspector_id → inspectors(id)`. An Inspector sees inspections whose `inspector_name` matches their linked inspector.
- `checklist_items` — the Setup-managed template (`label`, `kind` text|photo|text_photo, `sort_order`, `active`). Deleting an item deactivates it so past answers keep their label.
- `inspection_checklist_responses` — one per (inspection, item): `text_value`, `photo_path`, plus a `label` snapshot.
- `inspection_room_plan` — the inspector's room list: `room_name`, `sort_order`, `photo_path`.
- `inspections.field_completed_at`.

## Photos

Private Supabase bucket `inspection-field-photos`, served through short-lived signed URLs — unlike the public `inspection-stills` bucket, these can include the lockbox and the house's utility details. Photos are resized in the browser (longest side 1600px, JPEG) before upload, which also converts iPad HEIC to JPEG and keeps each upload well under Vercel's request-size limit.

## Security

- `requireSession()` / `requireSessionOrThrow()` reject `Inspector` by default (pages redirect to `/field`), so every existing page and server action stays office-only with no per-call changes. The six report/PDF route handlers that call `verifySession()` directly get the same check.
- Field pages and actions use `requireFieldAccess(inspectionId)`: Admin/General User may open any inspection's field view; an Inspector only their own assigned inspections.
- `app/proxy.ts` optimistically redirects an Inspector to `/field` from any other path.

## AI integration

When an inspection has a room plan, `processNextInspectionVideo` passes it to the prompt as the required room list ("use exactly these names"), replacing the inferred rooms-so-far list. The split-seam carry-over from the Sylvia fix still applies on top.

## Not in v1

In-app video upload/recording (v2), offline capture, per-room photo galleries beyond one wide shot, assignment/scheduling UI beyond the existing Inspector field on the inspection.
