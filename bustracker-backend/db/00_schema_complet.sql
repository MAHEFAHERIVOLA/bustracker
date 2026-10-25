-- BusTracker PostgreSQL schema
-- Run only on a new/empty database with compatible PostGIS installed.



-- ===== 001_core.sql =====

-- 001_core.sql : extensions, utilisateurs, arrêts, bus
-- Nécessite PostgreSQL 14+ avec PostGIS (image Docker : postgis/postgis:16-3.4).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- recherche floue sur le nom des arrêts
CREATE EXTENSION IF NOT EXISTS citext;    -- email insensible à la casse

-- Utilisateurs -------------------------------------------------------------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL CHECK (length(trim(name)) > 0),
  email         CITEXT      NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Arrêts de bus -------------------------------------------------------------
CREATE TABLE stops (
  id         SERIAL PRIMARY KEY,
  name       TEXT                   NOT NULL,
  location   GEOGRAPHY(Point, 4326) NOT NULL,
  osm_id     BIGINT UNIQUE,         -- identifiant OpenStreetMap (import), NULL si saisi à la main
  created_at TIMESTAMPTZ            NOT NULL DEFAULT now()
);
CREATE INDEX stops_location_gix ON stops USING GIST (location);
CREATE INDEX stops_name_trgm    ON stops USING GIN (name gin_trgm_ops);

-- Bus (véhicules) -----------------------------------------------------------
-- line_id est ajouté dans la migration 002 (après la création de `lines`).
CREATE TABLE buses (
  id                  SERIAL PRIMARY KEY,
  registration_number TEXT        NOT NULL UNIQUE,   -- normalisée : sans espaces, majuscules
  bus_number          TEXT        NOT NULL,          -- numéro affiché sur le bus (ex. 163)
  status              TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX buses_bus_number_idx ON buses (bus_number);


-- ===== 002_lines.sql =====

-- 002_lines.sql : lignes de bus et ordre des arrêts par sens de circulation

CREATE TABLE lines (
  id         SERIAL PRIMARY KEY,
  number     TEXT        NOT NULL UNIQUE,     -- numéro de ligne affiché (ex. 163)
  name       TEXT        NOT NULL,            -- ex. « Port-Louis – Curepipe »
  terminus_a TEXT        NOT NULL,            -- sens AB : de A vers B
  terminus_b TEXT        NOT NULL,
  operator   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rattachement (optionnel) d'un bus à sa ligne habituelle
ALTER TABLE buses ADD COLUMN line_id INTEGER REFERENCES lines (id) ON DELETE SET NULL;
CREATE INDEX buses_line_idx ON buses (line_id);

-- Arrêts desservis, dans l'ordre, pour chaque sens (AB = aller, BA = retour)
CREATE TABLE line_stops (
  line_id   INTEGER  NOT NULL REFERENCES lines (id) ON DELETE CASCADE,
  direction TEXT     NOT NULL CHECK (direction IN ('AB', 'BA')),
  seq       SMALLINT NOT NULL CHECK (seq > 0),
  stop_id   INTEGER  NOT NULL REFERENCES stops (id) ON DELETE CASCADE,
  PRIMARY KEY (line_id, direction, seq),
  UNIQUE (line_id, direction, stop_id)
);
CREATE INDEX line_stops_stop_idx ON line_stops (stop_id);


-- ===== 003_tracking.sql =====

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
