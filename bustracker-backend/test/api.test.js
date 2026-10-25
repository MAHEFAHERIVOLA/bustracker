// Test d'intégration de l'API sur une VRAIE base PostgreSQL/PostGIS.
// Lance avec : TEST_DATABASE_URL=postgres://... npm test
// ⚠ Utilise une base de TEST : les tables sont vidées au début.
const test = require('node:test');
const assert = require('node:assert/strict');

const DB = process.env.TEST_DATABASE_URL;
if (!DB) {
  test('API (intégration)', { skip: 'TEST_DATABASE_URL non défini' }, () => {});
  return;
}

process.env.DATABASE_URL = DB;
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');
const { closeStaleSessions, purgePositions } = require('../src/jobs');

const api = request(app);
const PORT_LOUIS = { lat: -20.1609, lng: 57.5012 };
let token;
let token2;

const auth = (t) => ({ Authorization: `Bearer ${t}` });

test.before(async () => {
  await pool.query(
    'TRUNCATE positions, tracking_sessions, buses, line_stops, lines, stops, users RESTART IDENTITY CASCADE'
  );
  await pool.query(
    `INSERT INTO stops (name, location) VALUES
       ('Gare Test A', ST_SetSRID(ST_MakePoint(57.5012, -20.1609), 4326)::geography),
       ('Gare Test B', ST_SetSRID(ST_MakePoint(57.5200, -20.3170), 4326)::geography)`
  );
  await pool.query(`INSERT INTO lines (number, name, terminus_a, terminus_b) VALUES ('163', 'Test A – B', 'A', 'B')`);
  await pool.query(`INSERT INTO line_stops VALUES (1,'AB',1,1),(1,'AB',2,2),(1,'BA',1,2),(1,'BA',2,1)`);
});

test.after(async () => { await pool.end(); });

test('health', async () => {
  const r = await api.get('/api/health').expect(200);
  assert.equal(r.body.status, 'ok');
});

test('inscription, doublon d\'email (casse), connexion, mauvais mot de passe', async () => {
  const r = await api.post('/api/auth/register').send({ name: 'Yannel', email: 'Y@Test.mu', password: 'secret1' }).expect(201);
  token = r.body.token;
  await api.post('/api/auth/register').send({ name: 'Autre', email: 'y@test.MU', password: 'secret1' }).expect(409);
  await api.post('/api/auth/register').send({ name: 'X', email: 'pas-un-email', password: 'secret1' }).expect(400);
  await api.post('/api/auth/login').send({ email: 'y@test.mu', password: 'secret1' }).expect(200);
  await api.post('/api/auth/login').send({ email: 'y@test.mu', password: 'faux' }).expect(401);
  token2 = (await api.post('/api/auth/register').send({ name: 'Deux', email: 'deux@test.mu', password: 'secret2' }).expect(201)).body.token;
});

test('routes protégées sans token', async () => {
  await api.post('/api/tracking/start').send({}).expect(401);
  await api.get('/api/tracking/active').expect(401);
});

test('arrêts : proximité et recherche', async () => {
  const near = await api.get('/api/stops/nearby').query({ ...PORT_LOUIS, radius: 500 }).expect(200);
  assert.equal(near.body.length, 1);
  assert.equal(near.body[0].name, 'Gare Test A');
  await api.get('/api/stops/nearby').query({ lat: 'x', lng: 1 }).expect(400);
  const found = await api.get('/api/stops').query({ q: 'gare test b' }).expect(200);
  assert.equal(found.body[0].name, 'Gare Test B');
});

test('lignes : liste et arrêts ordonnés par sens', async () => {
  const lines = await api.get('/api/lines').query({ q: '16' }).expect(200);
  assert.equal(lines.body[0].number, '163');
  const ab = await api.get('/api/lines/1/stops').query({ direction: 'AB' }).expect(200);
  assert.deepEqual(ab.body.map((s) => s.name), ['Gare Test A', 'Gare Test B']);
  const ba = await api.get('/api/lines/1/stops').query({ direction: 'BA' }).expect(200);
  assert.deepEqual(ba.body.map((s) => s.name), ['Gare Test B', 'Gare Test A']);
  await api.get('/api/lines/999/stops').expect(404);
});

let sessionId;

test('démarrage du suivi : validation, rattachement automatique à la ligne, conflit de plaque', async () => {
  await api.post('/api/tracking/start').set(auth(token)).send({ registrationNumber: 'x', busNumber: '163', direction: 'AB' }).expect(400);
  await api.post('/api/tracking/start').set(auth(token)).send({ registrationNumber: '1234 AB 21', busNumber: '163', direction: 'ZZ' }).expect(400);
  await api.post('/api/tracking/start').set(auth(token)).send({ registrationNumber: '1234 AB 21', busNumber: '163', direction: 'AB', ...{ lat: 48.8, lng: 2.3 } }).expect(422);
  await api.post('/api/tracking/start').set(auth(token)).send({ registrationNumber: '1234 AB 21', busNumber: '163', direction: 'AB', boardingStopId: 9999 }).expect(400);

  const r = await api.post('/api/tracking/start').set(auth(token))
    .send({ registrationNumber: '1234 ab 21', busNumber: '163', direction: 'AB', boardingStopId: 1, ...PORT_LOUIS }).expect(201);
  sessionId = r.body.sessionId;
  assert.equal(r.body.lineId, 1, 'le bus 163 doit être rattaché à la ligne 163');

  // même plaque, autre numéro de bus -> refusé
  await api.post('/api/tracking/start').set(auth(token2))
    .send({ registrationNumber: '1234AB21', busNumber: '999', direction: 'AB' }).expect(409);
});

test('session active récupérable (reprise après redémarrage)', async () => {
  const r = await api.get('/api/tracking/active').set(auth(token)).expect(200);
  assert.equal(r.body.session_id, sessionId);
  assert.equal(r.body.registration_number, '1234AB21');
  const none = await api.get('/api/tracking/active').set(auth(token2)).expect(200);
  assert.equal(none.body, null);
});

test('positions : acceptées, refusées si incohérentes, session d\'un autre refusée', async () => {
  await api.post(`/api/tracking/${sessionId}/position`).set(auth(token)).send({ lat: -20.17, lng: 57.51, speedKmh: 35 }).expect(200);
  await api.post(`/api/tracking/${sessionId}/position`).set(auth(token)).send({ lat: -20.17, lng: 57.51, speedKmh: 500 }).expect(422);
  await api.post(`/api/tracking/${sessionId}/position`).set(auth(token)).send({ lat: 0, lng: 0 }).expect(422);
  await api.post(`/api/tracking/${sessionId}/position`).set(auth(token)).send({ lat: 'a', lng: 1 }).expect(400);
  await api.post(`/api/tracking/${sessionId}/position`).set(auth(token2)).send({ lat: -20.17, lng: 57.51 }).expect(404);
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM positions WHERE session_id = $1', [sessionId]);
  assert.equal(rows[0].n, 1);
});

test('carte : un point par bus, nombre de passagers, filtre par ligne', async () => {
  // 2e passager dans le même bus
  const s2 = (await api.post('/api/tracking/start').set(auth(token2))
    .send({ registrationNumber: '1234AB21', busNumber: '163', direction: 'AB', lat: -20.18, lng: 57.52 }).expect(201)).body.sessionId;
  const r = await api.get('/api/tracking/buses').expect(200);
  assert.equal(r.body.length, 1);
  assert.equal(r.body[0].reporters, 2);
  assert.equal(r.body[0].line_number, '163');
  assert.equal(r.body[0].is_stale, false);
  assert.equal(r.body[0].position_source, 'passenger');
  assert.equal((await api.get('/api/tracking/buses').query({ lineId: 1 })).body.length, 1);
  assert.equal((await api.get('/api/tracking/buses').query({ lineId: 2 })).body.length, 0);
  await api.post(`/api/tracking/${s2}/stop`).set(auth(token2)).expect(200);
});

test('un passager ne garde qu\'une session active (ancienne marquée « replaced »)', async () => {
  const again = (await api.post('/api/tracking/start').set(auth(token))
    .send({ registrationNumber: '1234AB21', busNumber: '163', direction: 'BA', ...PORT_LOUIS }).expect(201)).body.sessionId;
  const old = (await pool.query('SELECT is_active, end_reason FROM tracking_sessions WHERE id = $1', [sessionId])).rows[0];
  assert.equal(old.is_active, false);
  assert.equal(old.end_reason, 'replaced');
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM tracking_sessions WHERE user_id = 1 AND is_active');
  assert.equal(rows[0].n, 1);
  sessionId = again;
});

test('obsolescence : position ancienne signalée, puis session fermée par le job', async () => {
  await pool.query(`UPDATE tracking_sessions SET last_update = now() - interval '3 minutes' WHERE id = $1`, [sessionId]);
  const stale = await api.get('/api/tracking/buses').expect(200);
  assert.equal(stale.body[0].is_stale, true);

  await pool.query(`UPDATE tracking_sessions SET last_update = now() - interval '6 minutes' WHERE id = $1`, [sessionId]);
  assert.equal(await closeStaleSessions(), 1);
  const row = (await pool.query('SELECT is_active, end_reason FROM tracking_sessions WHERE id = $1', [sessionId])).rows[0];
  assert.equal(row.end_reason, 'timeout');
  assert.equal(row.is_active, false);
  assert.equal((await api.get('/api/tracking/buses')).body.length, 0);
  await api.post(`/api/tracking/${sessionId}/position`).set(auth(token)).send({ lat: -20.17, lng: 57.51 }).expect(404);
});

test('purge de l\'historique des positions', async () => {
  await pool.query(`UPDATE positions SET recorded_at = now() - interval '30 days'`);
  assert.ok((await purgePositions()) >= 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM positions')).rows[0].n, 0);
});

test('arrêt volontaire et route inconnue', async () => {
  const s = (await api.post('/api/tracking/start').set(auth(token))
    .send({ registrationNumber: '9999ZZ21', busNumber: '42', direction: 'AB' }).expect(201)).body.sessionId;
  await api.post(`/api/tracking/${s}/stop`).set(auth(token)).expect(200);
  const row = (await pool.query('SELECT end_reason FROM tracking_sessions WHERE id = $1', [s])).rows[0];
  assert.equal(row.end_reason, 'user');
  await api.get('/api/nimporte').expect(404);
  await api.post('/api/auth/login').set('Content-Type', 'application/json').send('{pas du json').expect(400);
});
