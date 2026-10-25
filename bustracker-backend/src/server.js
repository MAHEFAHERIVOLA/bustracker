const { config, assertValid } = require('./config');

try {
  assertValid();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const app = require('./app');
const { pool } = require('./db/pool');
const { startJobs } = require('./jobs');

const server = app.listen(config.port, '0.0.0.0', () =>
  console.log(`API BusTracker sur le port ${config.port} (${config.env})`)
);

const stopJobs = config.disableJobs ? () => {} : startJobs();

function shutdown(signal) {
  console.log(`${signal} reçu, arrêt en cours...`);
  stopJobs();
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
