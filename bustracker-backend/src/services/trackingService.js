const { pool, withTransaction } = require('../db/pool');
const { config } = require('../config');
const { HttpError } = require('../utils/httpError');
const { normalizePlate, isValidPlate, isValidCoord, isInArea } = require('../utils/geo');

const t = config.tracking;
const DIRECTIONS = ['AB', 'BA'];

/** Vérifie une position GPS ; lève HttpError(400/422) si elle est incohérente. */
function assertValidPosition(lat, lng, speedKmh) {
  if (!isValidCoord(lat, lng)) throw new HttpError(400, 'Coordonnées invalides');
  if (!isInArea(lat, lng, t.area)) throw new HttpError(422, 'Position hors de la zone de service (Maurice)');
  if (speedKmh != null) {
    if (typeof speedKmh !== 'number' || !Number.isFinite(speedKmh) || speedKmh < 0) {
      throw new HttpError(400, 'Vitesse invalide');
    }
    if (speedKmh > t.maxSpeedKmh) throw new HttpError(422, 'Vitesse incohérente pour un bus');
  }
}

/**
 * Démarre le suivi d'un bus par un passager.
 * - crée le bus s'il est inconnu (clé = immatriculation)
 * - rattache le bus à une ligne si possible (lineId fourni, ou ligne dont le numéro = numéro du bus)
 * - ferme l'éventuelle session précédente du passager
 */
async function startSession({ userId, registrationNumber, busNumber, direction, boardingStopId, lineId, lat, lng }) {
  const plate = normalizePlate(registrationNumber);
  const number = String(busNumber ?? '').trim();
  if (!isValidPlate(plate)) throw new HttpError(400, "Immatriculation invalide (3 à 12 lettres/chiffres)");
  if (!number || number.length > 10) throw new HttpError(400, 'Numéro de bus invalide');
  if (!DIRECTIONS.includes(direction)) throw new HttpError(400, 'Direction invalide (AB ou BA)');

  const hasPos = lat != null && lng != null;
  if (hasPos) assertValidPosition(lat, lng, null);

  return withTransaction(async (db) => {
    // 1. Le bus (clé : immatriculation)
    // Un bus doit d'abord être créé et validé par un administrateur.
    const bus = (await db.query('SELECT * FROM buses WHERE registration_number = $1', [plate])).rows[0];
    if (!bus) throw new HttpError(403, 'Bus inconnu : demande à un administrateur de l’ajouter et de le confirmer.');
    if (bus.bus_number !== number) throw new HttpError(409, `Cette immatriculation est déjà associée au bus n°${bus.bus_number}. Vérifie ta saisie.`);
    if (bus.approval_status !== 'approved') throw new HttpError(403, bus.approval_status === 'rejected' ? 'Ce bus a été refusé par l’administrateur.' : 'Ce bus est en attente de confirmation par l’administrateur.');

    // 2. La ligne : explicite, sinon celle déjà connue du bus, sinon celle dont le numéro correspond
    let resolvedLine = lineId ?? bus.line_id ?? null;
    if (resolvedLine == null) {
      resolvedLine = (await db.query('SELECT id FROM lines WHERE number = $1', [number])).rows[0]?.id ?? null;
    }
    if (resolvedLine != null && bus.line_id !== resolvedLine) {
      // FK : lève 23503 (→ 400) si la ligne n'existe pas
      await db.query('UPDATE buses SET line_id = $2 WHERE id = $1', [bus.id, resolvedLine]);
    }

    // 3. Une seule session active par passager
    await db.query(
      `UPDATE tracking_sessions SET is_active = FALSE, ended_at = now(), end_reason = 'replaced'
       WHERE user_id = $1 AND is_active`,
      [userId]
    );

    // 4. La nouvelle session
    const session = (await db.query(
      `INSERT INTO tracking_sessions (user_id, bus_id, boarding_stop_id, direction, last_location, last_update)
       VALUES ($1, $2, $3, $4,
               CASE WHEN $7::boolean THEN ST_SetSRID(ST_MakePoint($6::float8, $5::float8), 4326)::geography END,
               CASE WHEN $7::boolean THEN now() END)
       RETURNING id`,
      [userId, bus.id, boardingStopId ?? null, direction, lat ?? 0, lng ?? 0, hasPos]
    )).rows[0];

    return { sessionId: session.id, busId: bus.id, lineId: resolvedLine };
  });
}

/** Enregistre une position : met à jour la session ET ajoute à l'historique, en une seule requête. */
async function addPosition({ sessionId, userId, lat, lng, speedKmh }) {
  assertValidPosition(lat, lng, speedKmh ?? null);
  const { rowCount } = await pool.query(
    `WITH upd AS (
       UPDATE tracking_sessions
       SET last_location = ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography,
           last_speed_kmh = $4::real, last_update = now()
       WHERE id = $1 AND user_id = $5 AND is_active
       RETURNING id
     )
     INSERT INTO positions (session_id, location, speed_kmh)
     SELECT id, ST_SetSRID(ST_MakePoint($3::float8, $2::float8), 4326)::geography, $4::real FROM upd`,
    [sessionId, lat, lng, speedKmh ?? null, userId]
  );
  if (!rowCount) throw new HttpError(404, 'Session introuvable ou terminée');
}

async function stopSession({ sessionId, userId }) {
  await pool.query(
    `UPDATE tracking_sessions SET is_active = FALSE, ended_at = now(), end_reason = 'user'
     WHERE id = $1 AND user_id = $2 AND is_active`,
    [sessionId, userId]
  );
}

/** Session active du passager (pour reprendre le suivi après un redémarrage de l'app). */
async function getActiveSession(userId) {
  const { rows } = await pool.query(
    `SELECT s.id AS session_id, s.direction, s.started_at,
            b.registration_number, b.bus_number, b.line_id
     FROM tracking_sessions s JOIN buses b ON b.id = s.bus_id
     WHERE s.user_id = $1 AND s.is_active`,
    [userId]
  );
  return rows[0] ?? null;
}

/**
 * Bus visibles sur la carte : un point par bus (la position la plus récente),
 * avec le nombre de passagers qui le suivent (`reporters`).
 */
async function getLiveBuses({ lineId } = {}) {
  const { rows } = await pool.query(
    `WITH fresh AS (
       SELECT s.*, EXTRACT(EPOCH FROM (now() - s.last_update))::int AS age
       FROM tracking_sessions s
       WHERE s.is_active AND s.last_location IS NOT NULL
         AND s.last_update > now() - make_interval(secs => $1::float8)
     ), ranked AS (
       SELECT fresh.*,
              row_number() OVER (PARTITION BY bus_id ORDER BY last_update DESC) AS rn,
              count(*)     OVER (PARTITION BY bus_id)                           AS reporters
       FROM fresh
     )
     SELECT b.id, b.bus_number, b.registration_number, b.status, b.operational_state,
            b.line_id, l.number AS line_number,
            r.direction,
            ST_Y(r.last_location::geometry) AS latitude,
            ST_X(r.last_location::geometry) AS longitude,
            r.last_speed_kmh, r.last_update,
            r.age AS seconds_since_update,
            r.reporters::int AS reporters
     FROM ranked r
     JOIN buses b ON b.id = r.bus_id
     LEFT JOIN lines l ON l.id = b.line_id
     WHERE r.rn = 1 AND b.approval_status = 'approved' AND b.status = 'active' AND ($2::int IS NULL OR b.line_id = $2::int)
     ORDER BY b.bus_number, b.id`,
    [t.visibleSeconds, lineId ?? null]
  );
  return rows.map((r) => ({
    ...r,
    position_source: 'passenger', // position fournie par un passager présent dans le bus
    is_stale: r.seconds_since_update > t.staleSeconds,
  }));
}

module.exports = { startSession, addPosition, stopSession, getActiveSession, getLiveBuses, assertValidPosition };
