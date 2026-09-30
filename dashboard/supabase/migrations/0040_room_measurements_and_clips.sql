-- 9355 Sylvia audit (2026-09-30): Chuck narrates every room's dimensions,
-- but the extraction output had nowhere to put them -- the Measurements
-- section of prompts/inspection-report-prompt-v1.md was dropped when the
-- prompt was adapted into lib/gemini.ts, so dimensions only survived when
-- the model happened to fold them into observed_evidence text ("3x15
-- hallway") and every bedroom's were lost. One row per spoken/read
-- measurement, keyed to the video it came from so a retry of that video can
-- delete and re-insert its own rows without touching any other video's.
create table if not exists room_measurements (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  inspection_video_id uuid references inspection_videos(id) on delete cascade,
  room_area text not null,
  what_measured text not null,
  measurement text not null,
  source text not null check (source in ('Narrated', 'Visually read', 'Both')),
  source_timestamp text,
  created_at timestamptz not null default now()
);

create index if not exists room_measurements_inspection_id_idx on room_measurements(inspection_id);

-- Per-room video clips (same audit): the AI returns the time span each room
-- occupies within a source video, and processNextInspectionVideo cuts that
-- span out with ffmpeg and uploads it to a "Room Clips" subfolder of the
-- inspection's Drive folder. A room that spans a split-segment seam gets one
-- row per source video. drive_file_id is NULL when the cut/upload was
-- skipped or failed (best-effort, same as stills) -- the span itself is
-- still recorded so the dashboard can fall back to "source file @ start".
create table if not exists room_clips (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  inspection_video_id uuid not null references inspection_videos(id) on delete cascade,
  room_area text not null,
  start_seconds numeric not null,
  end_seconds numeric not null,
  drive_file_id text,
  filename text,
  created_at timestamptz not null default now()
);

create index if not exists room_clips_inspection_id_idx on room_clips(inspection_id);
create index if not exists room_clips_inspection_video_id_idx on room_clips(inspection_video_id);
