-- RSS nodes persistence: one JSONB blob per map + individual flags
CREATE TABLE kvk_rss_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid REFERENCES kvk_maps(id) ON DELETE CASCADE,
  nodes jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  UNIQUE(map_id)
);

CREATE TABLE kvk_rss_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid REFERENCES kvk_maps(id) ON DELETE CASCADE,
  node_x float NOT NULL,
  node_y float NOT NULL,
  node_type text,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_kvk_rss_nodes_map ON kvk_rss_nodes(map_id);
CREATE INDEX idx_kvk_rss_flags_map ON kvk_rss_flags(map_id);

ALTER TABLE kvk_rss_nodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read kvk_rss_nodes" ON kvk_rss_nodes FOR SELECT USING (true);
CREATE POLICY "Public write kvk_rss_nodes" ON kvk_rss_nodes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update kvk_rss_nodes" ON kvk_rss_nodes FOR UPDATE USING (true);

ALTER TABLE kvk_rss_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read kvk_rss_flags" ON kvk_rss_flags FOR SELECT USING (true);
CREATE POLICY "Public write kvk_rss_flags" ON kvk_rss_flags FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete kvk_rss_flags" ON kvk_rss_flags FOR DELETE USING (true);
