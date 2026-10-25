const rateLimit = require('express-rate-limit');
const { config } = require('../config');

const noop = (_req, _res, next) => next();

const make = (opts) =>
  config.rateLimit.enabled
    ? rateLimit({
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: 'Trop de requêtes, réessaie dans un instant.' },
        ...opts,
      })
    : noop;

// Limite générale par adresse IP
const generalLimiter = make({ windowMs: 60_000, limit: config.rateLimit.generalPerMinute });
// Plus stricte sur connexion/inscription (anti force brute)
const authLimiter = make({ windowMs: 15 * 60_000, limit: config.rateLimit.authPer15Min });

module.exports = { generalLimiter, authLimiter };
