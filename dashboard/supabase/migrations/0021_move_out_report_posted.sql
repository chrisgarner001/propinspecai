-- Tracks whether the Move-Out Report has been posted to PropertyWare and
-- attached to the tenant's file. Real PW API access/docs aren't available
-- yet (same situation as work_order_batches/sendBatchToPW), so this is
-- populated by postMoveOutReport as a manually-confirmed stand-in, not a
-- real API call -- see app/actions.ts.
alter table inspections add column if not exists move_out_report_posted_at timestamptz;
alter table inspections add column if not exists move_out_report_pw_reference text;
