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
