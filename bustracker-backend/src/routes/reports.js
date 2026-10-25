const router = require('express').Router();
const { pool } = require('../db/pool');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { HttpError } = require('../utils/httpError');
const STATES = ['marche', 'arret', 'panne', 'transfert', 'school', 'plein'];
const CATEGORIES = ['panne', 'retard', 'etat_incorrect', 'position_incorrecte', 'autre'];
const toPositiveInt = (v, label = 'Identifiant') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, `${label} invalide`);
  return n;
};

// POST /api/reports : un signalement ne modifie JAMAIS directement l'état officiel du bus.
router.post('/', requireAuth, async (req, res) => {
  const b = req.body || {};
  const busId = b.busId == null || b.busId === '' ? null : toPositiveInt(b.busId, 'Bus');
  const registrationNumber = String(b.registrationNumber || '').replace(/\s+/g, '').toUpperCase().slice(0, 30) || null;
  const busNumber = String(b.busNumber || '').trim().slice(0, 30) || null;
  const lineId = b.lineId == null || b.lineId === '' ? null : toPositiveInt(b.lineId, 'Ligne');
  const stopId = b.stopId == null || b.stopId === '' ? null : toPositiveInt(b.stopId, 'Arrêt');
  const category = String(b.category || 'autre');
  const state = b.state == null || b.state === '' ? null : String(b.state);
  const description = String(b.description || '').trim().slice(0, 1000) || null;
  const lat = b.lat == null || b.lat === '' ? null : Number(b.lat);
  const lng = b.lng == null || b.lng === '' ? null : Number(b.lng);
  if (!busId && !(registrationNumber && busNumber)) throw new HttpError(400, 'Sélectionne un bus ou saisis son immatriculation et son numéro');
  if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Catégorie de signalement invalide');
  if (state !== null && !STATES.includes(state)) throw new HttpError(400, 'État signalé invalide');
  if ((lat === null) !== (lng === null) || (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180))) throw new HttpError(400, 'Coordonnées GPS invalides');
  if (description && description.length > 1000) throw new HttpError(400, 'Description trop longue');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let bus = null;
    if (busId) bus = (await client.query('SELECT id,registration_number,bus_number,line_id FROM buses WHERE id=$1', [busId])).rows[0];
    else bus = (await client.query('SELECT id,registration_number,bus_number,line_id FROM buses WHERE registration_number=$1', [registrationNumber])).rows[0];
    if (busId && !bus) throw new HttpError(404, 'Bus introuvable');
    if (bus) {
      if (registrationNumber && registrationNumber !== bus.registration_number) throw new HttpError(409, 'L’immatriculation ne correspond pas au bus sélectionné');
      if (busNumber && busNumber !== bus.bus_number) throw new HttpError(409, 'Le numéro ne correspond pas au bus sélectionné');
    }
    const resolvedLine = lineId ?? bus?.line_id ?? null;
    if (resolvedLine && !(await client.query('SELECT 1 FROM lines WHERE id=$1', [resolvedLine])).rowCount) throw new HttpError(404, 'Ligne introuvable');
    if (stopId && !(await client.query('SELECT 1 FROM stops WHERE id=$1', [stopId])).rowCount) throw new HttpError(404, 'Arrêt introuvable');
    const { rows } = await client.query(
      `INSERT INTO bus_reports(bus_id,stop_id,user_id,operational_state,latitude,longitude,registration_number,bus_number,line_id,category,description,review_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending')
       RETURNING id,bus_id,registration_number,bus_number,line_id,stop_id,category,description,operational_state,review_status,created_at`,
      [bus?.id ?? null, stopId, req.user.id, state, lat, lng, bus?.registration_number ?? registrationNumber, bus?.bus_number ?? busNumber, resolvedLine, category, description]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
  finally { client.release(); }
});

// Les retours d'expérience restent séparés des signalements et ne modifient pas l'état du bus.
router.post('/feedback', requireAuth, async (req, res) => {
  const b = req.body || {};
  const busId = toPositiveInt(b.busId, 'Bus');
  const stopId = b.stopId == null || b.stopId === '' ? null : toPositiveInt(b.stopId, 'Arrêt');
  const allowed = ['a_l_heure', 'en_retard', 'mauvais_etat', 'pas_venu'];
  const status = String(b.status || '');
  const eta = b.etaMinutes == null ? null : Number(b.etaMinutes);
  if (!allowed.includes(status)) throw new HttpError(400, 'Type de retour invalide');
  if (eta !== null && (!Number.isInteger(eta) || eta < 0 || eta > 1440)) throw new HttpError(400, 'Temps estimé invalide');
  const exists = await pool.query('SELECT 1 FROM buses WHERE id=$1', [busId]);
  if (!exists.rowCount) throw new HttpError(404, 'Bus introuvable');
  const { rows } = await pool.query(`INSERT INTO user_feedback(bus_id,stop_id,user_id,status,eta_prevue_min) VALUES($1,$2,$3,$4,$5) RETURNING *`, [busId, stopId, req.user.id, status, eta]);
  res.status(201).json(rows[0]);
});

// Consultation et décision réservées à l'administrateur.
router.get('/admin', requireAuth, requireAdmin, async (req, res) => {
  const status = String(req.query.status || '');
  const allowed = ['', 'pending', 'in_review', 'approved', 'rejected'];
  if (!allowed.includes(status)) throw new HttpError(400, 'Filtre de statut invalide');
  const { rows } = await pool.query(
    `SELECT r.id,r.bus_id,r.registration_number,r.bus_number,r.line_id,r.stop_id,r.category,r.description,r.operational_state,r.latitude,r.longitude,r.review_status,r.admin_note,r.created_at,r.reviewed_at,
            u.name AS reporter_name,s.name AS stop_name,l.number AS line_number
     FROM bus_reports r LEFT JOIN users u ON u.id=r.user_id LEFT JOIN stops s ON s.id=r.stop_id LEFT JOIN lines l ON l.id=r.line_id
     WHERE $1='' OR r.review_status=$1 ORDER BY CASE r.review_status WHEN 'pending' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END,r.created_at DESC LIMIT 300`, [status]
  );
  res.json(rows);
});

router.patch('/admin/:id/review', requireAuth, requireAdmin, async (req, res) => {
  const reportId = toPositiveInt(req.params.id, 'Signalement');
  const status = String(req.body?.status || '');
  const note = String(req.body?.adminNote || '').trim().slice(0, 1000) || null;
  if (!['in_review', 'approved', 'rejected'].includes(status)) throw new HttpError(400, 'Décision invalide');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = (await client.query('SELECT * FROM bus_reports WHERE id=$1 FOR UPDATE', [reportId])).rows[0];
    if (!report) throw new HttpError(404, 'Signalement introuvable');
    if (status === 'approved' && report.bus_id && report.operational_state) {
      const mapped = report.operational_state;
      await client.query('UPDATE buses SET operational_state=$2 WHERE id=$1', [report.bus_id, mapped]);
    }
    const { rows } = await client.query(
      `UPDATE bus_reports SET review_status=$2,admin_note=$3,reviewed_by=$4,reviewed_at=CASE WHEN $2 IN ('approved','rejected') THEN now() ELSE reviewed_at END WHERE id=$1
       RETURNING id,bus_id,review_status,admin_note,reviewed_by,reviewed_at`, [reportId, status, note, req.user.id]
    );
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
  finally { client.release(); }
});
module.exports = router;
