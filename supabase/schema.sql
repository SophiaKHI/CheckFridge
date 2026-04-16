-- ============================================================
-- CheckFridge — Supabase Schema
-- Run this in your Supabase SQL editor to set up the database.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- Table: fridge_items
-- ─────────────────────────────────────────
create table if not exists public.fridge_items (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  icon         text not null default '🥦',
  expiry_date  date not null,
  added_at          timestamptz not null default now(),
  status            text not null default 'active'
                      check (status in ('active', 'used', 'trashed')),
  status_changed_at timestamptz
);

-- Migration: add status_changed_at if upgrading an existing database
alter table public.fridge_items add column if not exists status_changed_at timestamptz;

-- Index for fast per-user queries
create index if not exists fridge_items_user_id_idx on public.fridge_items(user_id);
create index if not exists fridge_items_status_idx  on public.fridge_items(status);

-- ─────────────────────────────────────────
-- Row Level Security (RLS)
-- ─────────────────────────────────────────
alter table public.fridge_items enable row level security;

-- Users can only see their own items
create policy "Users see own items"
  on public.fridge_items for select
  using (auth.uid() = user_id);

-- Users can insert their own items
create policy "Users insert own items"
  on public.fridge_items for insert
  with check (auth.uid() = user_id);

-- Users can update their own items
create policy "Users update own items"
  on public.fridge_items for update
  using (auth.uid() = user_id);

-- Users can delete their own items
create policy "Users delete own items"
  on public.fridge_items for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- Edge Function placeholder (Anna to implement)
-- This function is called by the OpenAI proxy Edge Function.
-- Deploy via: supabase functions deploy openai-proxy
-- ─────────────────────────────────────────
-- See: /supabase/functions/openai-proxy/index.ts
