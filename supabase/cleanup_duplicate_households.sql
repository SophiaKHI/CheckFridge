-- Clean up duplicate household_members rows caused by partial creates
-- before the RLS recursion fix was applied.
--
-- Run once in the Supabase SQL editor.

-- 1. For each user, keep only the most recent household_members row
DELETE FROM public.household_members
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM public.household_members
  ORDER BY user_id, joined_at DESC
);

-- 2. Remove households that now have no members
DELETE FROM public.households
WHERE id NOT IN (
  SELECT DISTINCT household_id FROM public.household_members
);
