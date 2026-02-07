-- Migration: Add share_id column for shareable plan URLs
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)

-- Add share_id column for unique shareable URLs
ALTER TABLE public.aoo_strategy
ADD COLUMN IF NOT EXISTS share_id text UNIQUE;

-- Add name column for plan identification
ALTER TABLE public.aoo_strategy
ADD COLUMN IF NOT EXISTS name text;

-- Add created_at if not exists
ALTER TABLE public.aoo_strategy
ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Add updated_at column
ALTER TABLE public.aoo_strategy
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Create index for share_id lookups
CREATE INDEX IF NOT EXISTS aoo_strategy_share_id_idx ON public.aoo_strategy(share_id);

-- Generate share_ids for existing records (if any don't have one)
UPDATE public.aoo_strategy
SET share_id = substr(md5(random()::text), 1, 8)
WHERE share_id IS NULL;

-- Drop the old unique constraint on (event_mode, aoo_team)
-- since we're now using share_id as the unique identifier for plans
ALTER TABLE public.aoo_strategy DROP CONSTRAINT IF EXISTS aoo_strategy_mode_team_unique;

-- Remove CHECK constraints to allow any values (or NULL) for shareable plans
ALTER TABLE public.aoo_strategy DROP CONSTRAINT IF EXISTS aoo_strategy_event_mode_check;
ALTER TABLE public.aoo_strategy DROP CONSTRAINT IF EXISTS aoo_strategy_aoo_team_check;

-- Make event_mode and aoo_team nullable for new shareable plans
ALTER TABLE public.aoo_strategy ALTER COLUMN event_mode DROP NOT NULL;
ALTER TABLE public.aoo_strategy ALTER COLUMN aoo_team DROP NOT NULL;
