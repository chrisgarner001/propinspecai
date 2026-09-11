-- Supplier/SKU per line item, for the Quote Sheet editor.
alter table line_items add column if not exists supplier text;
alter table line_items add column if not exists sku text;

-- "Scheduled" is a real stage between Approved and Work In Process (owner
-- approved the quote, work is booked but hasn't started) -- the Quote Sheet
-- page's status pill needs it and it shares the same inspections.status
-- column as the inspection detail page's pill, so the value has to exist
-- there too.
alter table inspections drop constraint if exists inspections_status_check;
alter table inspections add constraint inspections_status_check
  check (status in ('under_review', 'quote_sent', 'approved', 'scheduled', 'in_process', 'completed'));
