-- Migration: Equipment rating & reward heads
-- Run this in Supabase SQL Editor

-- Officer-assigned equipment rating (0-10) based on screenshot evaluation
ALTER TABLE public.mge_applications
  ADD COLUMN IF NOT EXISTS equipment_rating smallint;

-- Gold head rewards per rank tier
ALTER TABLE public.mge_rank_tiers
  ADD COLUMN IF NOT EXISTS reward_heads int;
