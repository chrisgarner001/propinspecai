-- Bulk-item auto-fill (docs/designs/quote-sheet-bulk-item-auto-fill.md): adding
-- a bulk material surfaces a suggest-and-confirm banner listing line items
-- whose (still-blank) Supplier/SKU it looks like it covers. This flag tracks
-- whether that banner has been resolved (applied or dismissed) for a given
-- bulk material, so it doesn't keep reappearing on every page load once the
-- reviewer has acted on it once.
alter table inspection_bulk_materials add column if not exists matches_reviewed boolean not null default false;
