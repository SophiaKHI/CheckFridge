-- ============================================================
-- CheckFridge — Expiry Reference Table
-- Shared lookup table of ~200 common foods and their typical
-- shelf life in the fridge, freezer, and pantry.
--
-- Usage:
--   1. Run this file in the Supabase SQL editor to create the
--      table + RLS policy.
--   2. In the Table Editor, open `expiry_reference` and use
--      "Import data from CSV" to load expiry_reference.csv.
-- ============================================================

-- ─────────────────────────────────────────
-- Table: expiry_reference
-- ─────────────────────────────────────────
create table if not exists public.expiry_reference (
  id            bigserial primary key,
  name          text not null unique,
  category      text not null,
  icon          text,
  fridge_days   integer,
  freezer_days  integer,
  pantry_days   integer,
  updated_at    timestamptz not null default now()
);

-- Case-insensitive lookup (so "Chicken" and "chicken" both match)
create index if not exists expiry_reference_name_lower_idx
  on public.expiry_reference (lower(name));

create index if not exists expiry_reference_category_idx
  on public.expiry_reference (category);

-- ─────────────────────────────────────────
-- Row Level Security
-- This is shared reference data — every authenticated user
-- can read it, but nobody can write to it from the client.
-- Edits happen via the SQL editor / service role.
-- ─────────────────────────────────────────
alter table public.expiry_reference enable row level security;

drop policy if exists "Anyone can read expiry reference"
  on public.expiry_reference;

create policy "Anyone can read expiry reference"
  on public.expiry_reference for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────
-- Helper: look up expiry days by food name (case-insensitive)
-- Returns NULL if no match.
-- ─────────────────────────────────────────
create or replace function public.lookup_fridge_days(item_name text)
returns integer
language sql
stable
as $$
  select fridge_days
  from public.expiry_reference
  where lower(name) = lower(item_name)
  limit 1;
$$;
