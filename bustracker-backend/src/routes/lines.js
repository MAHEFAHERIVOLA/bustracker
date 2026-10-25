const router = require('express').Router();
const { pool } = require('../db/pool');
const { HttpError } = require('../utils/httpError');
const { requireAuth } = require('../middleware/auth');   // AJOUT

const toId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identifiant invalide');
  return n;
};

// GET /api/lines?q=163   -> liste des lignes (recherche par numéro ou nom)
router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 80);
  const { rows } = await pool.query(
    `SELECT l.id, l.number, l.name, l.terminus_a, l.terminus_b, l.operator,
            (SELECT count(*)::int FROM line_stops ls WHERE ls.line_id = l.id AND ls.direction = 'AB') AS stop_count
     FROM lines l
     WHERE $1 = '' OR l.number ILIKE $1 || '%' OR l.name ILIKE '%' || $1 || '%'
     ORDER BY l.number
     LIMIT 100`,
    [q]
  );
  res.json(rows);
});

// GET /api/lines/:id/stops?direction=AB   -> arrêts de la ligne dans l'ordre
router.get('/:id/stops', async (req, res) => {
  const id = toId(req.params.id);
  const direction = String(req.query.direction ?? 'AB').toUpperCase();
  if (!['AB', 'BA'].includes(direction)) throw new HttpError(400, 'Direction invalide (AB ou BA)');
  const line = (await pool.query('SELECT id FROM lines WHERE id = $1', [id])).rows[0];
  if (!line) throw new HttpError(404, 'Ligne introuvable');
  const { rows } = await pool.query(
    `SELECT ls.seq, s.id, s.name,
            ST_Y(s.location::geometry) AS latitude,
            ST_X(s.location::geometry) AS longitude
     FROM line_stops ls JOIN stops s ON s.id = ls.stop_id
     WHERE ls.line_id = $1 AND ls.direction = $2
     ORDER BY ls.seq`,
    [id, direction]
  );
  res.json(rows);
});

// AJOUT — POST /api/lines  { number, name, terminusA, terminusB }   -> crée une ligne
router.post('/', requireAuth, async (req, res) => {
  const b = req.body || {};
  const number = String(b.number ?? '').trim().toUpperCase().slice(0, 10);
  const name = String(b.name ?? '').trim().slice(0, 120);
  const terminusA = String(b.terminusA ?? '').trim().slice(0, 80);
  const terminusB = String(b.terminusB ?? '').trim().slice(0, 80);
  if (!number || !name || !terminusA || !terminusB) {
    throw new HttpError(400, 'Numéro, nom et les deux terminus sont requis');
  }
  // numéro déjà pris -> erreur 23505 -> 409 « Cette donnée existe déjà » (gérée par errors.js)
  const { rows } = await pool.query(
    `INSERT INTO lines (number, name, terminus_a, terminus_b, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, number, name, terminus_a, terminus_b`,
    [number, name, terminusA, terminusB, req.user.id]
  );
  res.status(201).json(rows[0]);
});

// AJOUT — PUT /api/lines/:id/stops  { direction: 'AB'|'BA', stopIds: [12, 7, 33, ...] }
// Remplace le trajet (liste ordonnée des arrêts) d'un sens de circulation.
router.put('/:id/stops', requireAuth, async (req, res) => {
  const id = toId(req.params.id);
  const direction = String(req.body?.direction ?? '').toUpperCase();
  if (!['AB', 'BA'].includes(direction)) throw new HttpError(400, 'Direction invalide (AB ou BA)');
  const stopIds = req.body?.stopIds;
  if (!Array.isArray(stopIds) || stopIds.length < 2 || stopIds.length > 150) {
    throw new HttpError(400, 'Un trajet doit contenir entre 2 et 150 arrêts');
  }
  const ids = stopIds.map(toId);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Un arrêt apparaît deux fois dans le trajet');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const line = (await client.query('SELECT id FROM lines WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!line) throw new HttpError(404, 'Ligne introuvable');
    await client.query('DELETE FROM line_stops WHERE line_id = $1 AND direction = $2', [id, direction]);
    await client.query(
      `INSERT INTO line_stops (line_id, direction, seq, stop_id)
       SELECT $1, $2, t.ord::smallint, t.stop_id
       FROM unnest($3::int[]) WITH ORDINALITY AS t(stop_id, ord)`,
      [id, direction, ids]
    );
    await client.query('UPDATE lines SET updated_at = now() WHERE id = $1', [id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  res.json({ ok: true, count: ids.length });
});

module.exports = router;
