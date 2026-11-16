import { app } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { closeDb } from './db.js';
import { deprecatedSettings } from './paths.js';

for (const [oldName, newName] of deprecatedSettings) {
  logger.warn(`setting ${oldName} is deprecated; use ${newName}`);
}

// Don't bind a port under test — supertest drives the app object directly.
if (!config.isTest) {
  const server = app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`);
  });

  // OPS-05: graceful shutdown. On SIGTERM/SIGINT stop accepting new connections,
  // let in-flight requests drain, close the database, then exit. A hard timeout
  // guards against a stuck connection holding the process open forever.
  let shuttingDown = false;
  function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down`);

    const forceExit = setTimeout(() => {
      logger.error('Shutdown timed out — forcing exit');
      process.exit(1);
    }, 10000).unref();

    server.close((err) => {
      clearTimeout(forceExit);
      if (err) {
        logger.error({ err }, 'Error during server close');
        process.exit(1);
      }
      try {
        closeDb();
      } catch (dbErr) {
        logger.error({ err: dbErr }, 'Error closing database');
      }
      logger.info('Shutdown complete');
      process.exit(0);
    });
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export { app };
