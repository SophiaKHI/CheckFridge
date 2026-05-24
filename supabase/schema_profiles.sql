-- ============================================================
-- CheckFridge — Profiles
-- Run AFTER schema_subscriptions.sql (needs in_same_household).
--
-- Each user gets a row here on first sign-in (upserted by the app).
-- Household members can read each other's profiles so the app can
-- show initials/colors for items added by other members.
-- ============================================================

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read and write their own profile
create policy "Users manage own profile"
  on public.profiles for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Household members can read each other's profiles
-- (uses the in_same_household helper from schema_subscriptions.sql)
create policy "Household members see profiles"
  on public.profiles for select
  using (public.in_same_household(user_id));
