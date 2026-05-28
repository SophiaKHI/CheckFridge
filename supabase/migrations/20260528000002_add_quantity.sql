-- Add quantity column to fridge_items.
-- DEFAULT 1 so all existing rows are correct without backfilling.
ALTER TABLE public.fridge_items
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 0);
