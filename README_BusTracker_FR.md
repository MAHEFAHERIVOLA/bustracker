# BusTracker — projet complet Ionic + Angular + Node.js + PostgreSQL/PostGIS

Ce dossier rassemble les deux ZIP fournis :
- `bustracker-ui/` : application Ionic + Angular (connexion, inscription, carte, partage GPS).
- `bustracker-backend/` : API Express, migrations SQL, authentification JWT, lignes, arrêts et suivi GPS.

## Important : éviter l'erreur PostGIS 3.6.2 sur Windows

Le backend utilise PostGIS pour les coordonnées GPS. Si ton installation PostgreSQL affiche une erreur disant que PostGIS 3.6.2 n'a pas de script d'installation, ne lance pas les migrations sur cette installation locale.

Le `docker-compose.yml` fournit une base PostgreSQL + PostGIS compatible. Elle utilise le port **5433** sur ton PC afin de ne pas entrer en conflit avec un PostgreSQL déjà installé sur le port 5432.

Il faut installer Docker Desktop et le démarrer avant les commandes Docker ci-dessous.

## Démarrage recommandé sur Windows

### 1. Démarrer PostgreSQL + PostGIS

Ouvre un terminal dans le dossier `bustracker-backend` :

```powershell
docker compose up -d db
```

Attends quelques secondes puis vérifie :

```powershell
docker compose ps
```

Cette base de développement utilise :
- base : `bustracker`
- utilisateur : `bustracker`
- mot de passe : `bustracker`
- port PC : `5433`

Ces identifiants sont réservés au développement local, pas à la production.

### 2. Installer et configurer le backend

Dans le terminal, toujours dans `bustracker-backend` :

```powershell
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Le fichier `.env.example` pointe sur la base Docker locale du port 5433. Si tu modifies le port, adapte `DATABASE_URL` dans `.env`.

Vérifie ensuite dans le navigateur :
`http://localhost:3000/api/health`

Le résultat attendu est `{"status":"ok"}`.

### 3. Installer et démarrer l'interface Ionic

Ouvre un **deuxième terminal** dans `bustracker-ui` :

```powershell
npm install
npm start
```

L'interface sera disponible à `http://localhost:8100`.

Pour tester sur PC, l'URL API dans `src/environments/environment.ts` doit rester :

```ts
apiUrl: 'http://localhost:3000/api'
```

### 4. Créer un compte et tester

1. Ouvre `http://localhost:8100`.
2. Choisis **Inscription** et crée un compte avec une adresse e-mail et un mot de passe d'au moins 6 caractères.
3. Ouvre l'onglet **Partager ma position**.
4. Saisis l'immatriculation, le numéro du bus et la direction.
5. Autorise l'accès à la localisation.
6. Ouvre **Carte** pour voir les positions récemment partagées.

Un bus ne s'affiche sur la carte que lorsqu'une session active partage une position récente. Les arrêts de démonstration sont approximatifs et la ligne `DEMO` n'est pas une vraie ligne commerciale.

## Android Studio / téléphone

Depuis `bustracker-ui` :

```powershell
npm run build
npx cap add android
npx cap sync android
npx cap open android
```

`npx cap add android` ne se lance qu'une seule fois. Ensuite, utilise `npm run build` puis `npx cap sync android` après les modifications.

Pour l'émulateur Android, modifie `src/environments/environment.ts` et remplace `localhost` par `10.0.2.2` :

```ts
apiUrl: 'http://10.0.2.2:3000/api'
```

Pour un téléphone réel, remplace l'adresse par l'IP locale de ton PC, par exemple `http://192.168.1.10:3000/api`. Le téléphone et le PC doivent être sur le même réseau Wi-Fi. Pour le développement Android en HTTP, configure l'autorisation de trafic HTTP non chiffré dans la configuration Android. Ne conserve pas ce réglage en production ; utilise HTTPS.

## Routes API intégrées à l'interface

- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/lines`, `GET /api/stops`
- `POST /api/tracking/start`
- `POST /api/tracking/:id/position`
- `POST /api/tracking/:id/stop`
- `GET /api/tracking/buses`
- `GET /api/health`

L'interface utilise les routes réelles du backend livré. Elle n'utilise plus les anciennes routes `/api/buses` et `/api/positions` qui n'existaient pas dans ce backend.

## Si une commande échoue

Copie le texte complet de l'erreur. Ne supprime pas les tables et ne lance pas `DROP DATABASE` pour tenter de corriger une migration.

## Carte « façon Waze » (OpenStreetMap)

La page **Carte** utilise OpenStreetMap (gratuit) via Leaflet, sans clé API :
- choix d'une ligne, d'un arrêt de départ et d'une destination ;
- bus en direct fournis par les passagers (`GET /api/tracking/buses`), ETA calculé sur l'itinéraire ;
- itinéraire routier via le serveur public OSRM (gratuit, à héberger soi-même en production) ;
- bouton « ＋ » : ajouter un arrêt (`POST /api/stops`, nécessite d'être connecté). Après `git pull`, lancez `npm run db:migrate` pour appliquer `004_contributions.sql`.


## Espace administrateur (ajouté)

1. Appliquer les migrations backend : `cd bustracker-backend` puis `npm run db:migrate`.
2. Créer d'abord un compte normal dans l'application, puis attribuer le rôle administrateur à cet utilisateur dans PostgreSQL :
   `UPDATE users SET role = 'admin' WHERE email = 'votre-email@example.com';`
3. Se déconnecter puis se reconnecter pour recevoir un jeton avec le rôle administrateur.
4. Ouvrir l'onglet **Administration**. Il permet d'ajouter et confirmer/refuser des bus, créer des lignes, ajouter des arrêts GPS et définir l'ordre des arrêts pour les sens A→B et B→A.

La validation d'un bus est contrôlée par l'API : les bus en attente ou refusés ne peuvent pas démarrer un partage GPS et ne sont pas affichés sur la carte. Ne donnez le rôle `admin` qu'à une personne de confiance.

## Compléments de validation des signalements (version de travail)

La migration `bustracker-backend/db/migrations/007_report_validation_workflow.sql` ajoute un workflow de validation sans supprimer les tables ni les données existantes. Les signalements sont enregistrés avec `review_status = pending`. Seul un administrateur peut les consulter dans l'onglet **Signalements** et les valider ou les rejeter. L'état officiel du bus n'est mis à jour qu'après validation d'un signalement qui contient un état opérationnel.

Après sauvegarde de la base PostgreSQL, exécuter depuis `bustracker-backend` :

```bash
npm run db:migrate
```

La carte ne reçoit une position GPS que lorsqu'un utilisateur autorisé partage réellement sa position depuis un appareil. L'ETA reste une estimation fondée sur la route et la vitesse disponible ou une vitesse moyenne de secours ; il ne s'agit pas d'une garantie.
