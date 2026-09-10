-- Fields captured at inspection creation time, before line items exist:
-- where the source MP4s live, freeform context for the reviewer, and a
-- pointer to the move-in report used to judge tenant-caused damage.
alter table inspections
  add column if not exists source_video_drive_folder_url text,
  add column if not exists special_instructions text,
  add column if not exists move_in_report_drive_url text;
