-- Which Google Drive file holds the raw clip a line item's source_timestamp
-- (now removed from the UI) used to point into. Multiple line items can
-- share the same video, so this is set once per unique source_video_file by
-- scripts/upload-videos.mjs, not per-row by hand.
alter table line_items add column if not exists source_video_drive_file_id text;
