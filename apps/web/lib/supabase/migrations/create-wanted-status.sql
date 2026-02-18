-- Create wanted_status table for officer marks on wanted players
CREATE TABLE IF NOT EXISTS public.wanted_status (
  governor_id BIGINT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('zeroed', 'left')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wanted_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON public.wanted_status FOR ALL USING (true) WITH CHECK (true);
