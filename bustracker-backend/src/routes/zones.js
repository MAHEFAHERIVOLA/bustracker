const router = require('express').Router();
const { pool } = require('../db/pool');
const { HttpError } = require('../utils/httpError');
const MAX_ZONE_DISTANCE_M = 1500;

const toId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identifiant invalide');
  return n;
};
const validCoord = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

// GET /api/zones
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(`SELECT z.id, z.name,
    COUNT(s.id)::int AS stop_count FROM zones z LEFT JOIN stops s ON s.zone_id=z.id
    GROUP BY z.id ORDER BY z.id`);
  res.json(rows);
});

// GET /api/zones/localiser?lat=...&lng=... (à déclarer avant /:id)
router.get('/localiser', async (req, res) => {
  const lat = Number.parseFloat(req.query.lat);
  const lng = Number.parseFloat(req.query.lng);
  if (!validCoord(lat, lng)) throw new HttpError(400, 'lat et lng requis ou invalides');
  const { rows } = await pool.query(`SELECT z.id AS zone_id, z.name AS zone_name,
      s.id AS stop_id, s.name AS stop_name,
      ST_Distance(s.location, ST_SetSRID(ST_MakePoint($2::float8,$1::float8),4326)::geography)::int AS distance_m
    FROM stops s JOIN zones z ON z.id=s.zone_id
    ORDER BY s.location <-> ST_SetSRID(ST_MakePoint($2::float8,$1::float8),4326)::geography LIMIT 1`, [lat,lng]);
  const nearest = rows[0];
  if (!nearest || nearest.distance_m > MAX_ZONE_DISTANCE_M) return res.json({ zone: null, message: 'Vous êtes hors de la zone couverte' });
  res.json({ zone: { id: nearest.zone_id, name: nearest.zone_name }, nearestStop: { id: nearest.stop_id, name: nearest.stop_name }, distanceM: nearest.distance_m });
});

// GET /api/zones/:id/stops
router.get('/:id/stops', async (req,res) => {
  const id=toId(req.params.id);
  const { rows }=await pool.query(`SELECT id,name,ST_Y(location::geometry) AS latitude,
    ST_X(location::geometry) AS longitude FROM stops WHERE zone_id=$1 ORDER BY id`,[id]);
  res.json(rows);
});

// GET /api/zones/:id/buses : bus des lignes passant par un arrêt de la zone
router.get('/:id/buses', async (req,res) => {
  const id=toId(req.params.id);
  const { rows }=await pool.query(`SELECT DISTINCT b.id,b.bus_number,b.registration_number,b.operational_state,
      l.id AS line_id,l.number AS line_number,l.name AS line_name,
      ST_Y(ts.last_location::geometry) AS latitude, ST_X(ts.last_location::geometry) AS longitude,
      ts.last_speed_kmh,ts.last_update
    FROM buses b JOIN lines l ON l.id=b.line_id
    JOIN line_stops ls ON ls.line_id=l.id JOIN stops s ON s.id=ls.stop_id
    LEFT JOIN LATERAL (SELECT last_location,last_speed_kmh,last_update FROM tracking_sessions
      WHERE bus_id=b.id AND is_active AND last_location IS NOT NULL ORDER BY last_update DESC LIMIT 1) ts ON TRUE
    WHERE s.zone_id=$1 ORDER BY l.number,b.bus_number`,[id]);
  res.json(rows);
});

// GET /api/zones/:id/itinerary?toStopId=123&lat=...&lng=...
// ETA estimée à partir de la distance GPS et de la vitesse observée, si disponibles.
router.get('/:id/itinerary', async (req,res) => {
  const zoneId=toId(req.params.id); const toStopId=toId(req.query.toStopId);
  const lat=Number.parseFloat(req.query.lat); const lng=Number.parseFloat(req.query.lng);
  const hasPosition=validCoord(lat,lng);
  const dest=(await pool.query('SELECT id FROM stops WHERE id=$1',[toStopId])).rows[0];
  if(!dest) throw new HttpError(404,"Arrêt de destination introuvable");
  const { rows }=await pool.query(`WITH candidates AS (
      SELECT DISTINCT l.id AS line_id,l.number AS line_number,l.name AS line_name,
        board.id AS boarding_stop_id,board.name AS boarding_stop_name,
        ST_Y(board.location::geometry) AS boarding_latitude,ST_X(board.location::geometry) AS boarding_longitude,
        b.id AS bus_id,b.bus_number,b.registration_number,b.operational_state,
        ST_Y(ts.last_location::geometry) AS latitude,ST_X(ts.last_location::geometry) AS longitude,
        ts.last_speed_kmh,ts.last_update,ts.direction,
        CASE WHEN $3::boolean THEN ST_Distance(board.location,ST_SetSRID(ST_MakePoint($5::float8,$4::float8),4326)::geography)::int ELSE NULL END AS walking_distance_m,
        CASE WHEN ts.last_location IS NOT NULL AND ts.last_speed_kmh > 0
          THEN CEIL(ST_Distance(ts.last_location,board.location)/1000.0/(ts.last_speed_kmh/60.0))::int ELSE NULL END AS eta_minutes
      FROM stops board JOIN line_stops lb ON lb.stop_id=board.id
      JOIN line_stops ld ON ld.line_id=lb.line_id AND ld.direction=lb.direction AND ld.stop_id=$2 AND ld.seq>lb.seq
      JOIN lines l ON l.id=lb.line_id JOIN buses b ON b.line_id=l.id
      LEFT JOIN LATERAL (SELECT last_location,last_speed_kmh,last_update,direction FROM tracking_sessions
        WHERE bus_id=b.id AND is_active ORDER BY last_update DESC LIMIT 1) ts ON TRUE
      WHERE board.zone_id=$1 AND board.id<>$2 AND b.operational_state='marche'
    ) SELECT * FROM candidates ORDER BY walking_distance_m NULLS LAST, eta_minutes NULLS LAST, line_number`,
    [zoneId,toStopId,hasPosition,lat,lng]);
  if(!rows.length) return res.status(404).json({error:"Aucun bus en marche ne relie cette zone à cet arrêt"});
  res.json(rows);
});
module.exports=router;
