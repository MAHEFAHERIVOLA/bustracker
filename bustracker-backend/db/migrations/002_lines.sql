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
