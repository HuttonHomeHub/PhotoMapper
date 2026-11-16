import { gracefulShutdown } from '@hhh/server';
import { app } from './app.ts';
import { config, deprecatedSettings } from './config.ts';
import { logger } from './logger.ts';
import { closeDb } from './db.ts';
import { startBackups } from './services/backups.ts';

for (const [oldName, newName] of deprecatedSettings) {
  logger.warn(`setting ${oldName} is deprecated; use ${newName}`);
}

// Don't bind a port under test — supertest drives the app object directly.
if (!config.isTest) {
  const server = app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`);
  });

  // OPS-05: on SIGTERM/SIGINT stop accepting connections, let in-flight requests
  // finish, stop the backup schedule, close the database, then exit (forced after 10 s).
  // Scheduled backups (BACKUP_INTERVAL_HOURS); the first runs five minutes after start.
  const stopBackups = startBackups();
  gracefulShutdown(server, {
    logger,
    onClose: () => {
      stopBackups();
      closeDb();
    },
  });
}

export { app };
