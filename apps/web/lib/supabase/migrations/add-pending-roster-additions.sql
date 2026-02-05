-- Migration: Add pending roster additions table
-- For users to suggest new members that need admin approval

-- =============================================================================
-- PENDING ROSTER ADDITIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.pending_roster_additions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Player info (what the user knows)
  name text NOT NULL,
  governor_id bigint,                    -- Optional: ROK governor ID
  power bigint DEFAULT 0,                -- Estimated power (optional)
  alliance text,                         -- Which alliance they're joining

  -- Who suggested this addition
  suggested_by text,                     -- Discord username or identifier
  suggested_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- Approval status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at timestamp with time zone,
  reviewed_by text,
  rejection_reason text,

  -- Prevent duplicate suggestions
  UNIQUE(name, alliance)
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS pending_roster_additions_status_idx ON public.pending_roster_additions(status);
CREATE INDEX IF NOT EXISTS pending_roster_additions_name_idx ON public.pending_roster_additions(name);
CREATE INDEX IF NOT EXISTS pending_roster_additions_governor_id_idx ON public.pending_roster_additions(governor_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.pending_roster_additions ENABLE ROW LEVEL SECURITY;

-- Anyone can view pending additions
CREATE POLICY "Anyone can view pending additions"
  ON public.pending_roster_additions FOR SELECT
  USING (true);

-- Anyone can insert pending additions (anonymous suggestions allowed)
CREATE POLICY "Anyone can insert pending additions"
  ON public.pending_roster_additions FOR INSERT
  WITH CHECK (true);

-- Only leaders/admins can update (approve/reject)
CREATE POLICY "Leaders can update pending additions"
  ON public.pending_roster_additions FOR UPDATE
  USING (public.is_leader_or_admin());

-- =============================================================================
-- GRANTS
-- =============================================================================

GRANT SELECT, INSERT ON public.pending_roster_additions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_roster_additions TO authenticated;
