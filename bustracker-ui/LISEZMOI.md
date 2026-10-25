# BusTracker — interface Ionic + Angular

Cette interface est raccordée au backend situé dans `../bustracker-backend`.

## Installation
```powershell
npm install
npm start
```

Le serveur Angular écoute sur `http://localhost:8100`. L'API doit être démarrée sur `http://localhost:3000`.

## Configuration de l'API
Modifie `src/environments/environment.ts` :
- Navigateur Windows : `http://localhost:3000/api`
- Émulateur Android : `http://10.0.2.2:3000/api`
- Téléphone réel : `http://IP_LOCALE_DU_PC:3000/api`

## Android
```powershell
npm run build
npx cap add android
npx cap sync android
npx cap open android
```
`npx cap add android` ne se lance qu'une seule fois. Pour les étapes Windows, PostGIS et base de données, lire `../README_BusTracker_FR.md`.
