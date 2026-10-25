-- Exemple à adapter à la géographie réelle de tes arrêts.
-- Les noms doivent être uniques. Exécuter seulement après la migration 005.
INSERT INTO zones(name) VALUES ('Rose Hill'), ('Zone centrale'), ('Camp Levieux')
ON CONFLICT (name) DO NOTHING;

-- Exemple : affecter un arrêt en connaissant son ID et le nom de sa zone.
-- UPDATE stops SET zone_id=(SELECT id FROM zones WHERE name='Rose Hill') WHERE id=1;
-- Vérifier les affectations :
-- SELECT s.id,s.name,z.name AS zone FROM stops s LEFT JOIN zones z ON z.id=s.zone_id ORDER BY s.id;
