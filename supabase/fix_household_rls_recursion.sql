-- Fix: infinite recursion in households / household_members RLS policies.
--
-- Root cause: "Owner manages members" on household_members queries households,
-- and "Members see their household" on households queries household_members.
-- These two policies form a cycle. "Members see household members" is also
-- self-referential. All three are replaced with security definer functions
-- that bypass RLS, breaking every cycle.
--
-- Run this once in the Supabase SQL editor.

-- ── Security-definer helpers ──────────────────────────────────────────────────

create or replace function public.is_household_owner(hid uuid)
returns boolean
language plpgsql
security definer
stable
as $$
begin
  return exists (
    select 1 from public.households
    where id = hid and owner_id = auth.uid()
  );
end;
$$;

create or replace function public.is_household_member(hid uuid)
returns boolean
language plpgsql
security definer
stable
as $$
begin
  return exists (
    select 1 from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
end;
$$;

-- ── household_members policies ────────────────────────────────────────────────

drop policy if exists "Owner manages members"          on public.household_members;
drop policy if exists "Members see household members"  on public.household_members;

create policy "Owner manages members"
  on public.household_members for all
  using  (public.is_household_owner(household_id))
  with check (public.is_household_owner(household_id));

create policy "Members see household members"
  on public.household_members for select
  using (public.is_household_member(household_id));

-- ── households policies ───────────────────────────────────────────────────────

drop policy if exists "Members see their household" on public.households;

create policy "Members see their household"
  on public.households for select
  using (public.is_household_member(id));
