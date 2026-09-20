-- "Share Images" on the Image Folder page: a reviewer checks a subset of
-- still photos and gets a copyable link an owner/tenant can open without
-- logging in. `images` is a snapshot (url/room/item) taken at share-link
-- creation time, not a live join to line_items -- so a shared link keeps
-- working even if a line item is later edited, duplicated, or removed from
-- the Quote Sheet. `token` is the unguessable part of the public URL
-- (/share/<token>); there's no separate auth on that route.
create table if not exists image_share_links (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references inspections(id) on delete cascade,
  token text not null unique,
  images jsonb not null,
  created_at timestamptz not null default now()
);
