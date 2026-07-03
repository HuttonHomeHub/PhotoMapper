import { app } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';

// Don't bind a port under test — supertest drives the app object directly.
if (!config.isTest) {
  app.listen(config.port, () => {
    logger.info(`Server running on http://localhost:${config.port}`);
  });
}

export { app };
