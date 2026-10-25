const router = require('express').Router();
const { pool } = require('../db/pool');
const { HttpError } = require('../utils/httpError');
const { requireAuth } = require('../middleware/auth');   // AJOUT
const { isValidCoord } = require('../utils/geo');        // AJOUT

const MAX_RADIUS_M = 5000;
const DUPLICATE_RADIUS_M = 25; // AJOUT : même nom à moins de 25 m = même arrêt

// GET /api/stops/nearby?lat=-20.26&lng=57.47&radius=1000
router.get('/nearby', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new HttpError(400, 'lat et lng requis');
  }
  const radius = Math.min(Math.max(parseInt(req.query.radius, 10) || 1000, 1), MAX_RADIUS_M);
  const { rows } = await pool.query(
    `SELECT id, name,
            ST_Y(location::geometry) AS latitude,
            ST_X(location::geometry) AS longitude,
            ROUND(ST_Distance(location, p.pt))::int AS distance_m
     FROM stops, (SELECT ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)::geography AS pt) p
     WHERE ST_DWithin(location, p.pt, $3)
     ORDER BY distance_m
     LIMIT 100`,
    [lat, lng, radius]
  );
  res.json(rows);
});

// GET /api/stops?q=curepipe   (recherche par nom, tolère les fautes de frappe)
router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 80);
  const { rows } = await pool.query(
    `SELECT id, name, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
     FROM stops
     WHERE $1 = '' OR name ILIKE '%' || $1 || '%' OR name % $1
     ORDER BY CASE WHEN name ILIKE $1 || '%' THEN 0 ELSE 1 END, similarity(name, $1) DESC, name
     LIMIT 50`,
    [q]
  );
  res.json(rows);
});

// AJOUT — POST /api/stops  { name, lat, lng }   -> ajoute un arrêt (utilisateur connecté)
router.post('/', requireAuth, async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 100);
  const { lat, lng } = req.body || {};
  if (!name) throw new HttpError(400, "Le nom de l'arrêt est requis");
  if (!isValidCoord(lat, lng)) throw new HttpError(400, 'Position invalide');
  if (lat < -20.6 || lat > -19.9 || lng < 57.2 || lng > 57.9) throw new HttpError(400, "Position hors de l'île Maurice");

  // Évite les doublons : même nom (insensible à la casse) à moins de 25 m
  const dup = (
    await pool.query(
      `SELECT id, name, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
       FROM stops
       WHERE lower(name) = lower($1)
         AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography, $4)
       LIMIT 1`,
      [name, lat, lng, DUPLICATE_RADIUS_M]
    )
  ).rows[0];
  if (dup) return res.json({ ...dup, created: false });

  const { rows } = await pool.query(
    `INSERT INTO stops (name, location, created_by)
     VALUES ($1, ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography, $4)
     RETURNING id, name, ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude`,
    [name, lat, lng, req.user.id]
  );
  res.status(201).json({ ...rows[0], created: true });
});

module.exports = router;
