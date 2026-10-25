-- Workflow de validation des signalements. Migration additive : conserve les données existantes.
ALTER TABLE bus_reports ALTER COLUMN bus_id DROP NOT NULL;
ALTER TABLE bus_reports ALTER COLUMN operational_state DROP NOT NULL;
ALTER TABLE bus_reports ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE bus_reports ADD COLUMN IF NOT EXISTS bus_number TEXT;
ALTER TABLE bus_reports ADD COLUMN IF NOT EXISTS line_id INTEGER REFERENCES lines(id) ON DELETE SET NULL;
ALTER TABLE bus_reports ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'etat_incorrect';
ALTER TABLE bus_reports ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE bus_reports ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (review_status IN ('pending','in_review','approved','rejected'));
ALTER TABLE bus_reports ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE bus_reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE bus_reports ADD COLUMN IF NOT EXISTS admin_note TEXT;
UPDATE bus_reports br SET registration_number=b.registration_number, bus_number=b.bus_number, line_id=b.line_id
FROM buses b WHERE br.bus_id=b.id AND br.registration_number IS NULL;
CREATE INDEX IF NOT EXISTS bus_reports_review_status_idx ON bus_reports(review_status, created_at DESC);
