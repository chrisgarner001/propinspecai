-- Replaces the original 3-value review workflow (pending_review/reviewed/
-- exported) with the actual quote/job lifecycle: quote_sent -> approved ->
-- in_process -> completed. "Exported" is dropped entirely -- it meant "sent
-- to Google Sheets", which no longer happens now that quotes are generated
-- in-app.
alter table inspections drop constraint if exists inspections_status_check;

update inspections set status = 'quote_sent' where status in ('pending_review', 'reviewed');
update inspections set status = 'completed' where status = 'exported';

alter table inspections alter column status set default 'quote_sent';
alter table inspections add constraint inspections_status_check
  check (status in ('quote_sent', 'approved', 'in_process', 'completed'));
