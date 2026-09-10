-- Add "Other" as a third Assigned To option, alongside the existing
-- GPM Staff / Outside Vendor.
alter table line_items drop constraint line_items_assigned_to_check;
alter table line_items add constraint line_items_assigned_to_check
  check (assigned_to in ('GPM Staff', 'Outside Vendor', 'Other'));
