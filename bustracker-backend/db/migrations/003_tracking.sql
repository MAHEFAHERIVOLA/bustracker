-- 003_tracking.sql : sessions de suivi (un passager dans un bus) et historique des positions

CREATE TABLE tracking_sessions (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bus_id           INTEGER     NOT NULL REFERENCES buses (id) ON DELETE CASCADE,
  boarding_stop_id INTEGER     REFERENCES stops (id) ON DELETE SET NULL,
  direction        TEXT        NOT NULL CHECK (direction IN ('AB', 'BA')),
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  last_location    GEOGRAPHY(Point, 4326),
  last_speed_kmh   REAL,
  last_update      TIMESTAMPTZ,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  end_reason       TEXT CHECK (end_reason IN ('user', 'replaced', 'timeout')),
  CHECK ((is_active AND ended_at IS NULL) OR (NOT is_active AND ended_at IS NOT NULL))
);

-- Un passager ne peut avoir qu'une seule session active (garanti par la base, pas seulement par le code)
CREATE UNIQUE INDEX tracking_one_active_per_user ON tracking_sessions (user_id) WHERE is_active;
-- Lecture de la carte : sessions actives, plus récentes d'abord
CREATE INDEX tracking_active_bus_idx ON tracking_sessions (bus_id, last_update DESC) WHERE is_active;
-- Nettoyage des sessions sans nouvelles
CREATE INDEX tracking_active_update_idx ON tracking_sessions (last_update) WHERE is_active;

-- Historique des positions (alimente plus tard : trajets, vitesse moyenne, arrivées estimées)
CREATE TABLE positions (
  id          BIGSERIAL PRIMARY KEY,
  session_id  INTEGER                NOT NULL REFERENCES tracking_sessions (id) ON DELETE CASCADE,
  location    GEOGRAPHY(Point, 4326) NOT NULL,
  speed_kmh   REAL,
  recorded_at TIMESTAMPTZ            NOT NULL DEFAULT now()
);
CREATE INDEX positions_session_time_idx ON positions (session_id, recorded_at DESC);
CREATE INDEX positions_time_idx         ON positions (recorded_at);   -- purge par ancienneté
