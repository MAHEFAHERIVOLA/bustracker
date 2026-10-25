const { pool } = require('../db/pool');
const { config } = require('../config');

/** Ferme les sessions dont le passager n'envoie plus rien (app fermée, téléphone éteint, plus de réseau...). */
async function closeStaleSessions() {
  const { rowCount } = await pool.query(
    `UPDATE tracking_sessions
     SET is_active = FALSE, ended_at = now(), end_reason = 'timeout'
     WHERE is_active
       AND COALESCE(last_update, started_at) < now() - make_interval(secs => $1::float8)`,
    [config.tracking.closeAfterSeconds]
  );
  if (rowCount) console.log(`[jobs] ${rowCount} session(s) fermée(s) pour inactivité`);
  return rowCount;
}

/** Supprime l'historique de positions plus ancien que la durée de rétention. */
async function purgePositions() {
  const { rowCount } = await pool.query(
    `DELETE FROM positions WHERE recorded_at < now() - make_interval(days => $1::int)`,
    [config.tracking.positionRetentionDays]
  );
  if (rowCount) console.log(`[jobs] ${rowCount} position(s) purgée(s)`);
  return rowCount;
}

/** Lance les tâches périodiques ; renvoie une fonction pour les arrêter. */
function startJobs() {
  const safe = (name, fn) => () => fn().catch((e) => console.error(`[jobs] ${name} :`, e.message));
  const timers = [
    setInterval(safe('closeStaleSessions', closeStaleSessions), 60_000),
    setInterval(safe('purgePositions', purgePositions), 60 * 60_000),
  ];
  // Premier passage immédiat (ex. après un redémarrage du serveur)
  safe('closeStaleSessions', closeStaleSessions)();
  safe('purgePositions', purgePositions)();
  timers.forEach((t) => t.unref());
  return () => timers.forEach(clearInterval);
}

module.exports = { closeStaleSessions, purgePositions, startJobs };
