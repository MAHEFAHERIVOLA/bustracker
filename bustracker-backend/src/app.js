const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { config } = require('./config');
const { pool } = require('./db/pool');
const { generalLimiter, authLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errors');

const app = express();

if (config.trustProxy) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } })); // API appelée depuis l'app (autre origine)
app.use(
  cors({
    // Développement sans liste : tout est autorisé. Sinon : uniquement les origines listées (l'app Capacitor en fait partie).
    origin: config.corsOrigins.length ? config.corsOrigins : true,
  })
);
app.use(express.json({ limit: '10kb' }));

// Santé : vérifie aussi la base (utile pour l'hébergeur et docker-compose)
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

app.use('/api', generalLimiter);
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/stops', require('./routes/stops'));
app.use('/api/lines', require('./routes/lines'));
app.use('/api/tracking', require('./routes/tracking'));
app.use('/api/zones', require('./routes/zones'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/admin', require('./routes/admin'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
