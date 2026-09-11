-- Adds "Under Review" as the actual first stage before a quote is sent --
-- missed in 0013. Every inspection is currently sitting at 'quote_sent' from
-- that migration (mapped from the old pending_review/reviewed), but nothing
-- has actually had a quote sent yet (the Quote Sheet feature didn't exist
-- until this same session), so all of them move back to 'under_review'.
alter table inspections drop constraint if exists inspections_status_check;

update inspections set status = 'under_review' where status = 'quote_sent';

alter table inspections alter column status set default 'under_review';
alter table inspections add constraint inspections_status_check
  check (status in ('under_review', 'quote_sent', 'approved', 'in_process', 'completed'));
