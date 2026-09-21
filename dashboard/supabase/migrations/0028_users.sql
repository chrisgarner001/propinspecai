-- Manage Users (Setup): email/password accounts with an access level. No
-- session/login enforcement is wired up yet (see app/login/page.tsx) -- this
-- is the user-record backend the login flow will eventually check against.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('Admin', 'General User')),
  created_at timestamptz not null default now()
);
