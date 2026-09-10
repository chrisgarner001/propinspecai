-- tenant_status was a single mutually-exclusive column ('tenant_charge' |
-- 'approved' | null), so checking one cleared the other. Charge and Approve
-- are independent reviewer decisions per item -- both need to be checkable
-- at once -- so replace it with two independent booleans.
alter table line_items
  add column tenant_charge boolean not null default false,
  add column tenant_approved boolean not null default false;

update line_items set tenant_charge = true where tenant_status = 'tenant_charge';
update line_items set tenant_approved = true where tenant_status = 'approved';

alter table line_items drop column tenant_status;
