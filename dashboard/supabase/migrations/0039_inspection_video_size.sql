-- Large-video processing fix (plan-eng-review, 2026-09-24): a video's Drive-
-- reported size, captured at sync time, so processNextInspectionVideo can
-- pre-flight reject an oversized video before ever attempting to download
-- it -- Vercel's ~512MB /tmp ceiling (measured live against this deployment
-- via a temporary diagnostic route) is the real governing constraint, not
-- Gemini's own 2GB Files API cap. NULL for rows synced before this
-- migration; scripts/backfill-video-sizes.mjs fills those in.
alter table inspection_videos add column if not exists size_bytes bigint;
