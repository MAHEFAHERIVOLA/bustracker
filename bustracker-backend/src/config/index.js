require('dotenv').config({ quiet: true });

const env = process.env;

const int = (key, fallback) => {
  const n = parseInt(env[key], 10);
  return Number.isFinite(n) ? n : fallback;
};

const config = {
  env: env.NODE_ENV || 'development',
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: int('PORT', 3000),
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  jwtExpiresIn: env.JWT_EXPIRES_IN || '7d',
  // Origines autorisées (CORS), séparées par des virgules. Vide en développement = tout autoriser.
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true', // derrière nginx/Render/Railway...
  disableJobs: env.DISABLE_JOBS === '1',

  tracking: {
    // Au-delà : le bus est affiché « position ancienne » sur la carte
    staleSeconds: int('STALE_SECONDS', 120),
    // Au-delà : le bus disparaît de la carte
    visibleSeconds: int('VISIBLE_SECONDS', 600),
    // Une session sans aucune position depuis ce délai est fermée automatiquement (passager parti sans appuyer sur « Je descends »)
    closeAfterSeconds: int('CLOSE_AFTER_SECONDS', 300),
    // Durée de conservation de l'historique des positions
    positionRetentionDays: int('POSITION_RETENTION_DAYS', 7),
    // Contrôles de cohérence d'une position
    maxSpeedKmh: int('MAX_SPEED_KMH', 130),
    // Zone de service (Maurice, île principale). Les positions hors zone sont refusées.
    area: {
      minLat: parseFloat(env.AREA_MIN_LAT ?? '-20.60'),
      maxLat: parseFloat(env.AREA_MAX_LAT ?? '-19.95'),
      minLng: parseFloat(env.AREA_MIN_LNG ?? '57.25'),
      maxLng: parseFloat(env.AREA_MAX_LNG ?? '57.90'),
    },
  },

  rateLimit: {
    enabled: env.NODE_ENV !== 'test' && env.RATE_LIMIT !== 'off',
    generalPerMinute: int('RATE_LIMIT_PER_MINUTE', 300),
    authPer15Min: int('RATE_LIMIT_AUTH_PER_15MIN', 30),
  },
};

/** À appeler au démarrage du serveur : échoue tôt avec un message clair. */
function assertValid() {
  const problems = [];
  if (!config.databaseUrl) problems.push('DATABASE_URL manquant');
  if (!config.jwtSecret) problems.push('JWT_SECRET manquant');
  else if (config.isProd && (config.jwtSecret.length < 32 || config.jwtSecret.startsWith('change-moi'))) {
    problems.push('JWT_SECRET trop court ou resté à la valeur d\'exemple (32 caractères aléatoires min. en production)');
  }
  if (config.isProd && config.corsOrigins.length === 0) {
    problems.push('CORS_ORIGINS manquant en production (ex. http://localhost,https://localhost)');
  }
  if (problems.length) throw new Error('Configuration invalide :\n - ' + problems.join('\n - '));
}

module.exports = { config, assertValid };
