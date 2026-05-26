-- Enable Supabase Realtime for fridge_items.
-- Without this, postgres_changes events are never broadcast to subscribers.
--
-- REPLICA IDENTITY FULL ensures DELETE events include the old row data
-- (needed so the client knows which item id was deleted).
--
-- Run once in the Supabase SQL editor.

alter table public.fridge_items replica identity full;

alter publication supabase_realtime add table public.fridge_items;
