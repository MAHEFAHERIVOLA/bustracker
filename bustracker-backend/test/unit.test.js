// Tests sans base de données : npm run test:unit
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePlate, isValidPlate, isValidCoord, isInArea, haversineMeters } = require('../src/utils/geo');
const { assertValidPosition } = require('../src/services/trackingService');

test('normalizePlate : espaces, tirets et casse', () => {
  assert.equal(normalizePlate(' 1234 ab-21 '), '1234AB21');
  assert.equal(normalizePlate(null), '');
});

test('isValidPlate', () => {
  assert.ok(isValidPlate('1234AB21'));
  assert.ok(!isValidPlate('AB'));
  assert.ok(!isValidPlate('12 34'));
  assert.ok(!isValidPlate('A'.repeat(13)));
});

test('isValidCoord', () => {
  assert.ok(isValidCoord(-20.2, 57.5));
  assert.ok(!isValidCoord(91, 0));
  assert.ok(!isValidCoord('1', 2));
  assert.ok(!isValidCoord(NaN, 2));
});

test('isInArea : Maurice dedans, Paris dehors', () => {
  const area = { minLat: -20.6, maxLat: -19.95, minLng: 57.25, maxLng: 57.9 };
  assert.ok(isInArea(-20.16, 57.5, area));
  assert.ok(!isInArea(48.85, 2.35, area));
});

test('haversineMeters : Port-Louis → Curepipe ≈ 17 km', () => {
  const d = haversineMeters(-20.1609, 57.5012, -20.317, 57.52);
  assert.ok(d > 16000 && d < 19000, `distance = ${d}`);
});

test('assertValidPosition : refuse hors zone, vitesse absurde, coordonnées invalides', () => {
  assert.doesNotThrow(() => assertValidPosition(-20.2, 57.5, 40));
  assert.doesNotThrow(() => assertValidPosition(-20.2, 57.5, null));
  assert.throws(() => assertValidPosition(48.85, 2.35, 10), { status: 422 });
  assert.throws(() => assertValidPosition(-20.2, 57.5, 400), { status: 422 });
  assert.throws(() => assertValidPosition(-20.2, 57.5, -3), { status: 400 });
  assert.throws(() => assertValidPosition('x', 57.5, 10), { status: 400 });
});
