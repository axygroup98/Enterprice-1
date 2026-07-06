-- Remove anon write access to system_config (keep read access for both roles)
-- Anon key users should not be able to modify system configuration
DROP POLICY IF EXISTS "sc_insert" ON system_config;
DROP POLICY IF EXISTS "sc_update" ON system_config;
DROP POLICY IF EXISTS "sc_delete" ON system_config;

CREATE POLICY "sc_insert" ON system_config FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "sc_update" ON system_config FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "sc_delete" ON system_config FOR DELETE
  TO authenticated USING (true);
