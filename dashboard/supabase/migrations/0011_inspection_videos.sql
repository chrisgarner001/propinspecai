-- Tracks the actual AI extraction pipeline (docs/designs/propinspecai-video-inspection-pipeline.md),
-- previously only ever run by hand. One row per video file found in an
-- inspection's linked Drive folder; drives the "Start Processing" progress
-- panel and lets a failed file be retried without reprocessing everything.
create table if not exists inspection_videos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  drive_file_id text not null,
  filename text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed')),
  error_message text,
  line_items_created integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inspection_id, drive_file_id)
);

create index if not exists inspection_videos_inspection_id_idx on inspection_videos(inspection_id);

create trigger inspection_videos_set_updated_at
  before update on inspection_videos
  for each row execute function set_updated_at();
