-- Free-text per-item field for the new in-app Quote Sheet editor, matching
-- the blank "Stage" column carried over from the old Google Sheet template
-- (never populated by anything -- just a place for the reviewer to jot
-- notes like "Scheduled 10/2").
alter table line_items add column if not exists quote_stage text;
