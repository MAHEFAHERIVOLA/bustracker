#!/usr/bin/env node
// Exécute db/seed/*.sql (données de démonstration). Usage : npm run db:seed
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const DIR = path.join(__dirname, '..', 'db', 'seed');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manquant (voir .env.example)');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
      console.log(`→ ${file}`);
      await client.query(fs.readFileSync(path.join(DIR, file), 'utf8'));
    }
    console.log('Seed terminé.');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
