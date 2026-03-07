const pool = require("./db"); // adapte si ton fichier s'appelle autrement

async function run() {
  const sql = `
BEGIN;

CREATE TABLE IF NOT EXISTS cabinets (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  adresse TEXT,
  telephone TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

ALTER TABLE medecins
ADD COLUMN IF NOT EXISTS cabinet_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = 'medecins'
      AND tc.constraint_name = 'medecins_cabinet_id_fkey'
  ) THEN
    ALTER TABLE medecins
    ADD CONSTRAINT medecins_cabinet_id_fkey
    FOREIGN KEY (cabinet_id) REFERENCES cabinets(id)
    ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO cabinets (nom)
SELECT 'Cabinet Principal'
WHERE NOT EXISTS (SELECT 1 FROM cabinets);

UPDATE medecins
SET cabinet_id = (SELECT id FROM cabinets ORDER BY id ASC LIMIT 1)
WHERE cabinet_id IS NULL;

ALTER TABLE medecins
ALTER COLUMN cabinet_id SET NOT NULL;

COMMIT;
`;

  try {
    await pool.query(sql);
    console.log("✅ Migration cabinets + cabinet_id OK");
    process.exit(0);
  } catch (e) {
    console.error("❌ Migration error:", e.message);
    process.exit(1);
  }
}

run();
