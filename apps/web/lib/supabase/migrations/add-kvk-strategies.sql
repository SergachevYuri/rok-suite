-- KvK Strategy Versioning
-- Stores snapshots of alliance assignments so officers can save, load, and share plans.

CREATE TABLE IF NOT EXISTS public.kvk_strategies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  map_id uuid NOT NULL REFERENCES public.kvk_maps(id) ON DELETE CASCADE,
  name text NOT NULL,
  share_code text UNIQUE,
  assignments jsonb NOT NULL DEFAULT '[]',
  alliance_snapshot jsonb NOT NULL DEFAULT '[]',
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(map_id, name)
);

CREATE INDEX IF NOT EXISTS idx_kvk_strategies_map ON public.kvk_strategies(map_id);
CREATE INDEX IF NOT EXISTS idx_kvk_strategies_share ON public.kvk_strategies(share_code);

ALTER TABLE public.kvk_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on kvk_strategies"
  ON public.kvk_strategies FOR SELECT USING (true);
CREATE POLICY "Allow public insert on kvk_strategies"
  ON public.kvk_strategies FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on kvk_strategies"
  ON public.kvk_strategies FOR UPDATE USING (true);
CREATE POLICY "Allow public delete on kvk_strategies"
  ON public.kvk_strategies FOR DELETE USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_strategies TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kvk_strategies TO authenticated;
