# BusTracker — backend

API Express + PostgreSQL/PostGIS pour le suivi des bus à Maurice. Un passager dans un bus partage sa position GPS ; les autres voient le bus sur la carte.

## Démarrage rapide

```bash
cp .env.example .env            # puis adapte DATABASE_URL et JWT_SECRET
docker compose up -d db         # PostgreSQL + PostGIS (ou ta propre installation, avec PostGIS)
npm install
npm run db:migrate              # crée toutes les tables
npm run db:seed                 # (optionnel) 5 arrêts + 1 ligne de DÉMO
npm run db:import-stops         # (recommandé) vrais arrêts depuis OpenStreetMap
npm run dev                     # API sur http://localhost:3000
```

Avec Docker pour tout : `docker compose up -d --build` (base + API, migrations appliquées au démarrage).

> **Tu as déjà une ancienne base `bustracker` créée à la main ?** Les migrations échoueront (« table already exists »). Le plus simple : crée une nouvelle base (`CREATE DATABASE bustracker2;`) et pointe `DATABASE_URL` dessus.

Sans Docker, sous Windows : installe PostgreSQL puis PostGIS via *Application Stack Builder* (inclus dans l'installeur PostgreSQL), et vérifie avec `CREATE EXTENSION postgis;`.

## Structure

```
db/
  migrations/   001_core.sql      users, stops, buses (+ extensions postgis, pg_trgm, citext)
                002_lines.sql     lines, line_stops (arrêts ordonnés par sens)
                003_tracking.sql  tracking_sessions, positions
  seed/         001_demo.sql      données de démonstration (idempotent)
scripts/        migrate.js · seed.js · import-osm-stops.js
src/
  config/       variables d'environnement + validation au démarrage
  db/           pool PostgreSQL + helper de transaction
  middleware/   auth (JWT), erreurs, limitation de débit
  routes/       auth · stops · lines · tracking     (HTTP uniquement)
  services/     trackingService.js                  (logique métier + SQL du suivi)
  jobs/         fermeture des sessions inactives, purge des positions
  utils/        géographie, HttpError
  app.js        assemble Express (testable)      server.js  lance le serveur
test/           unit.test.js · api.test.js (sur vraie base PostGIS)
```

**Ajouter une évolution de la base** : crée `db/migrations/004_xxx.sql` et lance `npm run db:migrate`. Ne modifie jamais une migration déjà appliquée.

## Modèle de données

| Table | Rôle |
|---|---|
| `users` | comptes (email unique, insensible à la casse) |
| `stops` | arrêts, `location` en `geography(Point)` + index GIST ; `osm_id` pour l'import |
| `lines` / `line_stops` | lignes (numéro, terminus A/B) et arrêts ordonnés par sens `AB`/`BA` |
| `buses` | véhicule identifié par son immatriculation (unique), numéro affiché, ligne (optionnelle) |
| `tracking_sessions` | un passager dans un bus ; **une seule session active par passager** (index unique partiel) ; `end_reason` = `user` / `replaced` / `timeout` |
| `positions` | historique GPS (purgé après 7 jours par défaut) |

## API

| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | – | état de l'API et de la base |
| POST | `/api/auth/register` · `/login` | – | `{name,email,password}` / `{email,password}` → `{user,token}` |
| GET | `/api/stops/nearby?lat&lng&radius` | – | arrêts proches (rayon max 5 km) |
| GET | `/api/stops?q=` | – | recherche par nom (tolère les fautes) |
| GET | `/api/lines?q=` | – | lignes |
| GET | `/api/lines/:id/stops?direction=AB` | – | arrêts de la ligne, dans l'ordre |
| GET | `/api/tracking/buses[?lineId=]` | – | bus visibles : 1 point par bus, `reporters` = nb de passagers, `is_stale` |
| GET | `/api/tracking/active` | ✔ | ma session en cours (reprise après redémarrage de l'app) ou `null` |
| POST | `/api/tracking/start` | ✔ | `{registrationNumber,busNumber,direction,boardingStopId?,lineId?,lat?,lng?}` |
| POST | `/api/tracking/:id/position` | ✔ | `{lat,lng,speedKmh?}` |
| POST | `/api/tracking/:id/stop` | ✔ | « Je descends du bus » |

Le format des réponses de l'ancienne version est conservé : l'app Angular existante fonctionne sans modification. Champs ajoutés : `line_id`, `line_number`, `reporters` (bus), `lineId` (réponse de `/start`).

## Comportement du suivi

- Un bus apparaît sur la carte tant qu'une session envoie des positions (`VISIBLE_SECONDS`, 10 min). Au-delà de `STALE_SECONDS` (2 min) il est marqué `is_stale`.
- Une session sans nouvelles depuis `CLOSE_AFTER_SECONDS` (5 min) est **fermée automatiquement** (`end_reason = timeout`).
- Positions refusées : hors de Maurice (zone configurable), vitesse > 130 km/h, coordonnées invalides.
- Si le numéro du bus correspond à un numéro de ligne connu, le bus est rattaché à cette ligne automatiquement.
- Si deux passagers sont dans le même bus, la position la plus récente est utilisée.

## Tests

```bash
npm run test:unit                                   # sans base de données
createdb bustracker_test
TEST_DATABASE_URL=postgres://user:mdp@localhost:5432/bustracker_test npm run db:migrate   # avec DATABASE_URL pointant sur la base de test
TEST_DATABASE_URL=postgres://user:mdp@localhost:5432/bustracker_test npm test             # ⚠ vide les tables de cette base
```

## Mise en production (checklist)

- `NODE_ENV=production`, `JWT_SECRET` aléatoire de 32+ caractères, `CORS_ORIGINS` renseigné : le serveur refuse de démarrer sinon.
- `TRUST_PROXY=1` derrière un reverse proxy ; servir l'API en **HTTPS**, puis dans l'app : `androidScheme: 'https'`, `cleartext: false`, `usesCleartextTraffic="false"`, et `apiUrl` en `https://`.
- Sauvegardes régulières de la base (`pg_dump`).
- Données d'arrêts © contributeurs OpenStreetMap (ODbL) : garde la mention dans l'app (déjà présente sur la carte Leaflet).

## Reste à faire côté application (non inclus ici)

1. **Suivi en arrière-plan** (priorité) : plugin de localisation en arrière-plan + service au premier plan Android, sinon le partage s'arrête quand l'écran s'éteint.
2. Au démarrage de l'app, appeler `GET /tracking/active` pour reprendre une session en cours.
3. Écran de choix de ligne / recherche (`/lines`) et filtre de la carte par ligne (`/tracking/buses?lineId=`).


## Fonctionnalités communautaires ajoutées

La migration `005_zones_reports_feedback.sql` ajoute les zones, les états opérationnels des bus, les signalements et les retours utilisateurs. Exécuter `npm run db:migrate` après sauvegarde de la base.

Routes ajoutées :
- `GET /api/zones` : zones et nombre d'arrêts.
- `GET /api/zones/localiser?lat=...&lng=...` : zone la plus proche, limitée à 1 500 m.
- `GET /api/zones/:id/stops` : arrêts de la zone.
- `GET /api/zones/:id/buses` : bus des lignes desservant la zone.
- `GET /api/zones/:id/itinerary?toStopId=...&lat=...&lng=...` : lignes/bus candidats vers la destination. L'ETA est estimée seulement si une vitesse GPS récente est disponible.
- `POST /api/reports` (connexion requise) : signalement. Corps JSON : `registrationNumber`, `busNumber`, `lineId`, `stopId` optionnel, `state` (`marche`, `arret`, `panne`, `transfert`, `school`, `plein`), `lat`/`lng` optionnels.
- `POST /api/reports/feedback` (connexion requise) : retour utilisateur. Corps JSON : `busId`, `status` (`a_l_heure`, `en_retard`, `mauvais_etat`, `pas_venu`), `stopId` et `etaMinutes` optionnels.

Les nouveaux endpoints réutilisent le schéma anglais existant (`stops`, `lines`, `line_stops`, `buses`) et ne nécessitent pas de créer des tables parallèles `arrets`, `trajets` ou `bus`. Les zones restent à renseigner par l'administrateur : aucune attribution arbitraire des arrêts à Rose Hill/Camp Levieux n'est effectuée automatiquement.
