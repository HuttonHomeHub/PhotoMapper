import { gracefulShutdown } from '@hhh/server';
import { app } from './app.ts';
import { config, deprecatedSettings } from './config.ts';
import { logger } from './logger.ts';
import { closeDb } from './db.ts';

for (const [oldName, newName] of deprecatedSettings) {
  logger.warn(`setting ${oldName} is deprecated; use ${newName}`);
}

// Don't bind a port under test — supertest drives the app object directly.
if (!config.isTest) {
  const server = app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`);
  });

  // OPS-05: on SIGTERM/SIGINT stop accepting connections, let in-flight requests
  // finish, close the database, then exit (forced after 10 s).
  gracefulShutdown(server, { logger, onClose: closeDb });
}

export { app };
