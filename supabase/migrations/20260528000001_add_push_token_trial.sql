-- ============================================================
-- CheckFridge — Add push_token and trial_start to profiles
-- Run in Supabase SQL editor.
-- ============================================================

-- push_token: stores the Expo push token for this user's device.
-- Null means the user has not enabled notifications (or has a simulator).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token text;

-- trial_start: when the user's free trial began.
-- DEFAULT now() means:
--   • existing users → set to the time this migration runs
--   • new users      → set to the time their profile row is first inserted
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_start timestamptz NOT NULL DEFAULT now();
