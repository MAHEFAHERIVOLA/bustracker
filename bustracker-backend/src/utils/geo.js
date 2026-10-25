/** Immatriculation normalisée : sans espaces ni tirets, en majuscules (« 1234 ab 21 » → « 1234AB21 »). */
const normalizePlate = (s) => String(s ?? '').replace(/[\s-]+/g, '').toUpperCase();

/** 3 à 12 lettres/chiffres. Volontairement souple : les formats mauriciens varient. */
const isValidPlate = (plate) => /^[A-Z0-9]{3,12}$/.test(plate);

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

const isValidCoord = (lat, lng) =>
  isFiniteNumber(lat) && isFiniteNumber(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** `area` = { minLat, maxLat, minLng, maxLng } */
const isInArea = (lat, lng, area) =>
  lat >= area.minLat && lat <= area.maxLat && lng >= area.minLng && lng <= area.maxLng;

/** Distance en mètres entre deux points (formule de haversine). */
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371008.8;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = { normalizePlate, isValidPlate, isValidCoord, isInArea, haversineMeters };
