-- ============================================================
-- CheckFridge — Subscription & Household Schema
-- Run this AFTER schema.sql (fridge_items must already exist).
-- ============================================================

-- pgcrypto for invite token generation
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────
-- Table: households
-- One row per paying group. Solo users don't need one —
-- household_id is nullable on subscriptions.
-- ─────────────────────────────────────────
create table if not exists public.households (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null default 'My Household',
  created_at  timestamptz not null default now()
);

create index if not exists households_owner_id_idx on public.households(owner_id);

alter table public.households enable row level security;

-- Owner can see and manage their household
create policy "Owner manages household"
  on public.households for all
  using  (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);


-- ─────────────────────────────────────────
-- Table: household_members
-- Owner is always inserted as role='owner' when the household is created.
-- Max 5 members enforced by trigger below.
-- ─────────────────────────────────────────
create table if not exists public.household_members (
  id            uuid primary key default uuid_generate_v4(),
  household_id  uuid not null references public.households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member'
                  check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  unique (household_id, user_id)
);

create index if not exists household_members_user_id_idx on public.household_members(user_id);

-- Enforce max 5 members per household
create or replace function public.enforce_household_member_limit()
returns trigger language plpgsql as $$
begin
  if (
    select count(*) from public.household_members
    where household_id = new.household_id
  ) >= 5 then
    raise exception 'Household already has the maximum of 5 members.';
  end if;
  return new;
end;
$$;

create trigger check_household_member_limit
  before insert on public.household_members
  for each row execute function public.enforce_household_member_limit();

alter table public.household_members enable row level security;

-- Owner can add/remove members
create policy "Owner manages members"
  on public.household_members for all
  using (
    exists (
      select 1 from public.households
      where id = household_id
        and owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.households
      where id = household_id
        and owner_id = auth.uid()
    )
  );

-- Any member can see who else is in the household
create policy "Members see household members"
  on public.household_members for select
  using (
    exists (
      select 1 from public.household_members hm
      where hm.household_id = household_members.household_id
        and hm.user_id = auth.uid()
    )
  );

-- Members can remove themselves (leave)
create policy "Members can leave"
  on public.household_members for delete
  using (auth.uid() = user_id and role = 'member');


-- Now that household_members exists, add the cross-table policy on households
-- Members can read the household they belong to
create policy "Members see their household"
  on public.households for select
  using (
    exists (
      select 1 from public.household_members
      where household_id = households.id
        and user_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────
-- Table: household_invites
-- Owner sends an invite by email; recipient accepts via token.
-- Tokens expire after 7 days.
-- ─────────────────────────────────────────
create table if not exists public.household_invites (
  id             uuid primary key default uuid_generate_v4(),
  household_id   uuid not null references public.households(id) on delete cascade,
  invited_by     uuid not null references auth.users(id),
  invited_email  text not null,
  token          text not null unique default encode(gen_random_bytes(16), 'hex'),
  status         text not null default 'pending'
                   check (status in ('pending', 'accepted', 'expired')),
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '7 days',
  unique (household_id, invited_email)
);

create index if not exists household_invites_token_idx   on public.household_invites(token);
create index if not exists household_invites_email_idx   on public.household_invites(invited_email);

alter table public.household_invites enable row level security;

-- Owner can create and view invites for their household
create policy "Owner manages invites"
  on public.household_invites for all
  using (auth.uid() = invited_by)
  with check (auth.uid() = invited_by);

-- Anyone with the token can read the invite (needed to accept it)
-- Enforced at the app layer; Supabase Edge Function validates token + creates member row.
create policy "Token holder can read invite"
  on public.household_invites for select
  using (true);  -- scoped by token lookup in Edge Function, not auth.uid()


-- ─────────────────────────────────────────
-- Table: subscriptions
-- One active row per user (or household for household plan).
-- RevenueCat webhooks write to this table via Edge Function.
-- ─────────────────────────────────────────
create table if not exists public.subscriptions (
  id                     uuid primary key default uuid_generate_v4(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  household_id           uuid references public.households(id) on delete set null,
  plan                   text not null check (plan in ('solo', 'household')),
  billing_interval       text not null check (billing_interval in ('monthly', 'annual')),
  status                 text not null default 'trialing'
                           check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  revenuecat_customer_id text,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx      on public.subscriptions(user_id);
create index if not exists subscriptions_household_id_idx on public.subscriptions(household_id);

-- Keep updated_at current automatically
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

-- Users can read their own subscription
create policy "Users see own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Only service role (RevenueCat webhook Edge Function) can write subscriptions
-- Application code reads only; writes come from the backend.
-- No insert/update policy for authenticated role intentionally.


-- ─────────────────────────────────────────
-- Helper: check if current user is in the same household as another user
-- Used by fridge_items RLS below.
-- ─────────────────────────────────────────
create or replace function public.in_same_household(other_user_id uuid)
returns boolean
language plpgsql
security definer
stable
as $$
begin
  return exists (
    select 1
    from public.household_members a
    join public.household_members b
      on a.household_id = b.household_id
    where a.user_id = auth.uid()
      and b.user_id = other_user_id
  );
end;
$$;


-- ─────────────────────────────────────────
-- Update fridge_items RLS: household members can see each other's items
-- Drop the old solo-only select policy and replace it.
-- ─────────────────────────────────────────
drop policy if exists "Users see own items" on public.fridge_items;

create policy "Users see own and household items"
  on public.fridge_items for select
  using (
    auth.uid() = user_id
    or public.in_same_household(user_id)
  );

-- Insert / update / delete remain personal — you can only change your own items.
-- (existing policies unchanged)
