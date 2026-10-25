const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { HttpError } = require('../utils/httpError');
const svc = require('../services/trackingService');

const toId = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, 'Identifiant invalide');
  return n;
};
const optId = (v) => (v == null || v === '' ? null : toId(v));

// GET /api/tracking/buses[?lineId=3]   -> bus visibles sur la carte (public)
router.get('/buses', async (req, res) => {
  res.json(await svc.getLiveBuses({ lineId: optId(req.query.lineId) }));
});

// GET /api/tracking/active   -> ma session en cours (reprise après redémarrage de l'app)
router.get('/active', requireAuth, async (req, res) => {
  res.json(await svc.getActiveSession(req.user.id)); // null si aucune
});

// POST /api/tracking/start  { registrationNumber, busNumber, direction, boardingStopId?, lineId?, lat?, lng? }
router.post('/start', requireAuth, async (req, res) => {
  const b = req.body || {};
  const result = await svc.startSession({
    userId: req.user.id,
    registrationNumber: b.registrationNumber,
    busNumber: b.busNumber,
    direction: b.direction,
    boardingStopId: optId(b.boardingStopId),
    lineId: optId(b.lineId),
    lat: b.lat,
    lng: b.lng,
  });
  res.status(201).json(result);
});

// POST /api/tracking/:id/position  { lat, lng, speedKmh? }
router.post('/:id/position', requireAuth, async (req, res) => {
  const { lat, lng, speedKmh } = req.body || {};
  await svc.addPosition({ sessionId: toId(req.params.id), userId: req.user.id, lat, lng, speedKmh });
  res.json({ ok: true });
});

// POST /api/tracking/:id/stop
router.post('/:id/stop', requireAuth, async (req, res) => {
  await svc.stopSession({ sessionId: toId(req.params.id), userId: req.user.id });
  res.json({ ok: true });
});

module.exports = router;
