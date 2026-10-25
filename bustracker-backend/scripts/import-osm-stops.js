#!/usr/bin/env node
// Importe les arrêts de bus de Maurice depuis OpenStreetMap (API Overpass) dans la table `stops`.
// Usage : npm run db:import-stops            (à lancer depuis ton PC, il faut internet)
//         npm run db:import-stops -- fichier.json   (réutilise un export Overpass déjà téléchargé)
// Idempotent : relancer met à jour les arrêts existants (clé : osm_id).
// Données © contributeurs OpenStreetMap (ODbL) — garde la mention dans l'app.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const { Client } = require('pg');

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
// Île Maurice (boîte englobante : sud, ouest, nord, est)
const QUERY = `[out:json][timeout:90];
(
  node["highway"="bus_stop"](-20.60,57.25,-19.95,57.90);
  node["public_transport"="platform"]["bus"="yes"](-20.60,57.25,-19.95,57.90);
);
out body;`;

async function loadElements() {
  const file = process.argv[2];
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8')).elements;
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'bustracker-student-project' },
    body: 'data=' + encodeURIComponent(QUERY),
  });
  if (!res.ok) throw new Error(`Overpass a répondu ${res.status}`);
  return (await res.json()).elements;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquant (voir .env.example)');
  const elements = (await loadElements()).filter((e) => e.type === 'node' && e.lat != null && e.lon != null);
  console.log(`${elements.length} arrêts reçus d'OpenStreetMap`);

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    let n = 0;
    for (const e of elements) {
      const name = (e.tags?.name || e.tags?.['name:fr'] || e.tags?.ref || `Arrêt ${e.id}`).trim();
      await client.query(
        `INSERT INTO stops (name, location, osm_id)
         VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
         ON CONFLICT (osm_id) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location`,
        [name, e.lon, e.lat, e.id]
      );
      n++;
    }
    await client.query('COMMIT');
    console.log(`${n} arrêts importés/mis à jour.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
