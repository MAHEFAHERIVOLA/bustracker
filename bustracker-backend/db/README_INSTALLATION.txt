BusTracker — fichiers de base de données PostgreSQL

Contenu :
- 001_core.sql : extensions, users, stops, buses
- 002_lines.sql : lines, relation buses.line_id, line_stops
- 003_tracking.sql : tracking_sessions et positions GPS
- 001_demo.sql : arrêts et ligne DEMO de test

Ordre d'exécution dans pgAdmin Query Tool :
1. migrations/001_core.sql
2. migrations/002_lines.sql
3. migrations/003_tracking.sql
4. seed/001_demo.sql (facultatif, données de démonstration)

IMPORTANT : ces scripts sont pour PostgreSQL, pas SQL Server.
Le schéma utilise PostGIS (types GEOGRAPHY, ST_SetSRID, ST_MakePoint) et les extensions pg_trgm et citext.
Si CREATE EXTENSION postgis échoue avec une erreur de script d'installation/version, il faut réparer/installer PostGIS compatible avec la version de PostgreSQL avant d'exécuter 001_core.sql.
Ne relancez pas les scripts complets si certaines tables existent déjà : ils ne sont pas tous conçus pour être rejoués et cela peut produire des erreurs. Sauvegardez la base avant toute modification.

Pour connaître les extensions visibles par le serveur :
SELECT name, default_version, installed_version
FROM pg_available_extensions
WHERE name IN ('postgis','pg_trgm','citext');

Pour voir les tables présentes :
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' ORDER BY table_name;
