const jwt = require('jsonwebtoken');
const { config } = require('../config');
const { HttpError } = require('../utils/httpError');

function signToken(user) {
  return jwt.sign({ id: user.id, name: user.name, role: user.role || 'user' }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Token manquant'));
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new HttpError(401, 'Token invalide'));
  }
}

function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') return next(new HttpError(403, 'Accès réservé aux administrateurs'));
  next();
}

module.exports = { signToken, requireAuth, requireAdmin };
