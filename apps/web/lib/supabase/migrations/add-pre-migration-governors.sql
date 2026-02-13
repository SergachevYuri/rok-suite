-- Pre-migration governors: stores governor IDs from pre-migration kingdom export
-- so the file doesn't need to be re-uploaded every scan.
CREATE TABLE pre_migration_governors (
  governor_id BIGINT PRIMARY KEY
);

-- Public read/write access (same pattern as kingdom_scans)
ALTER TABLE pre_migration_governors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON pre_migration_governors FOR SELECT USING (true);
CREATE POLICY "Public insert" ON pre_migration_governors FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete" ON pre_migration_governors FOR DELETE USING (true);
