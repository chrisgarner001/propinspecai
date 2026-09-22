-- Design: docs/designs/propinspec-inspection-type-gallery.md
--
-- inspection_type: the narrowest possible wedge onto "not every inspection is
-- a move-out" (2026-09-22 feedback). Existing inspections default to
-- Move-Out unchanged; Move-In is the only other value for now -- not a
-- configurable template system, see the design doc's Premise 3.
alter table inspections
  add column if not exists inspection_type text not null default 'Move-Out'
    check (inspection_type in ('Move-Out', 'Move-In'));

-- captured_at: the real per-photo timestamp the original pipeline design doc
-- required and this codebase never actually built (GPS turned out to be
-- unrecoverable from source video -- see the design doc's Technical
-- Finding -- but the video's own creation_time + frame offset is real and
-- usable). Nullable: null until the going-forward extraction path or the
-- backfill script (scripts/backfill-still-timestamps.mjs) populates it, and
-- stays null forever for a video with no creation_time tag at all.
alter table line_items
  add column if not exists captured_at timestamptz;
