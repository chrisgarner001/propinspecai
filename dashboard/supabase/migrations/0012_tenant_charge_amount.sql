-- Lets a reviewer charge the tenant less than the full line-item cost (e.g.
-- normal wear covers part of a repair). Null means "use the full
-- materials+labor cost", matching today's move-out-report behavior exactly
-- when unset.
alter table line_items add column if not exists tenant_charge_amount numeric;
