-- In-app "Split video" (2026-10-01, replaces the copy-a-terminal-command
-- step for oversized videos). splitNextVideoPart (app/actions.ts) cuts ONE
-- part per call, straight from Drive to Drive, and records progress here so
-- the panel can show "part 2 of 4" and a killed/timed-out call can resume
-- at the next part rather than starting over.
--   split_parts_total: set on the first call from the video's real duration.
--   split_parts: [{ fileId, name }] for each part confirmed uploaded, in order.
-- The row is deleted (and the original trashed in Drive) once every part is
-- uploaded -- the same end state as scripts/split-video.mjs.
alter table inspection_videos add column if not exists split_parts_total integer;
alter table inspection_videos add column if not exists split_parts jsonb not null default '[]'::jsonb;
