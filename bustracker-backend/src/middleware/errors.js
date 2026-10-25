const { HttpError } = require('../utils/httpError');

function notFound(req, _res, next) {
  next(new HttpError(404, `Route introuvable : ${req.method} ${req.path}`));
}

// Les routes async peuvent lever des erreurs librement : Express 5 les transmet ici.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  // Erreurs « métier » volontaires
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });

  // JSON invalide / trop gros
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requête trop volumineuse' });

  // Erreurs PostgreSQL les plus courantes
  switch (err.code) {
    case '23505': return res.status(409).json({ error: 'Cette donnée existe déjà' });
    case '23503': return res.status(400).json({ error: 'Référence invalide (arrêt, ligne ou bus inexistant)' });
    case '22P02':
    case '22003': return res.status(400).json({ error: 'Valeur invalide' });
    case '23514': return res.status(400).json({ error: 'Valeur refusée par la base de données' });
  }

  console.error(`[${req.method} ${req.originalUrl}]`, err);
  res.status(500).json({ error: 'Erreur serveur' });
}

module.exports = { notFound, errorHandler };
