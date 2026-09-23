import { app } from './app.js';
import { loadConfig } from './config/env.js';
import { logger } from './logging/logger.js';

const config = loadConfig();

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(
    {
      host: config.HOST,
      port: config.PORT,
      environment: config.NODE_ENV,
    },
    'Parento backend started',
  );
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutdown requested');
  server.close((error) => {
    if (error) {
      logger.error({ err: error }, 'Graceful shutdown failed');
      process.exitCode = 1;
      return;
    }

    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
