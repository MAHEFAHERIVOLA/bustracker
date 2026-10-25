-- 005_zones_reports_feedback.sql
-- Ajoute zones, état opérationnel, signalements et retours en restant compatible
-- avec le schéma existant (stops, lines, line_stops, buses, tracking_sessions).
CREATE TABLE IF NOT EXISTS zones (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE stops ADD COLUMN IF NOT EXISTS zone_id INTEGER REFERENCES zones(id) ON DELETE SET NULL;
ALTER TABLE buses ADD COLUMN IF NOT EXISTS operational_state TEXT NOT NULL DEFAULT 'marche'
  CHECK (operational_state IN ('marche', 'arret', 'panne', 'transfert', 'school', 'plein'));

CREATE TABLE IF NOT EXISTS bus_reports (
  id BIGSERIAL PRIMARY KEY,
  bus_id INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  stop_id INTEGER REFERENCES stops(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  operational_state TEXT NOT NULL CHECK (operational_state IN ('marche', 'arret', 'panne', 'transfert', 'school', 'plein')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);
CREATE INDEX IF NOT EXISTS bus_reports_bus_created_idx ON bus_reports(bus_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_feedback (
  id BIGSERIAL PRIMARY KEY,
  bus_id INTEGER NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
  stop_id INTEGER REFERENCES stops(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('a_l_heure', 'en_retard', 'mauvais_etat', 'pas_venu')),
  eta_prevue_min INTEGER CHECK (eta_prevue_min IS NULL OR eta_prevue_min >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_feedback_bus_created_idx ON user_feedback(bus_id, created_at DESC);
