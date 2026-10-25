-- Données de DÉMONSTRATION uniquement (pour tester la carte sans import réel).
-- Les coordonnées sont approximatives (centres des villes) et la ligne « DEMO » n'est PAS une vraie ligne.
-- Pour les vrais arrêts : npm run db:import-stops  (OpenStreetMap)
-- Relancer ce fichier est sans danger (idempotent).

INSERT INTO stops (name, location)
SELECT v.name, ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography
FROM (VALUES
  ('Port-Louis (demo)',    57.5012, -20.1609),
  ('Rose Hill (demo)',     57.4667, -20.2333),
  ('Quatre Bornes (demo)', 57.4790, -20.2650),
  ('Vacoas (demo)',        57.4783, -20.2981),
  ('Curepipe (demo)',      57.5200, -20.3170)
) AS v(name, lng, lat)
WHERE NOT EXISTS (SELECT 1 FROM stops s WHERE s.name = v.name AND s.osm_id IS NULL);

INSERT INTO lines (number, name, terminus_a, terminus_b, operator)
VALUES ('DEMO', 'Port-Louis – Curepipe (démo)', 'Port-Louis', 'Curepipe', 'demo')
ON CONFLICT (number) DO NOTHING;

-- Sens AB : Port-Louis → Curepipe ; sens BA : ordre inverse
INSERT INTO line_stops (line_id, direction, seq, stop_id)
SELECT l.id,
       d.direction,
       row_number() OVER (PARTITION BY d.direction ORDER BY CASE WHEN d.direction = 'AB' THEN o.ord ELSE -o.ord END),
       s.id
FROM lines l
CROSS JOIN (VALUES ('AB'), ('BA')) AS d(direction)
CROSS JOIN (VALUES
  ('Port-Louis (demo)', 1), ('Rose Hill (demo)', 2), ('Quatre Bornes (demo)', 3),
  ('Vacoas (demo)', 4), ('Curepipe (demo)', 5)
) AS o(name, ord)
JOIN stops s ON s.name = o.name AND s.osm_id IS NULL
WHERE l.number = 'DEMO'
ON CONFLICT DO NOTHING;
