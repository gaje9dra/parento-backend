import { app, database } from './app.js';
import { loadConfig } from './config/env.js';
import { logger } from './logging/logger.js';

const config = loadConfig();

const start = async (): Promise<void> => {
  if (database.configured) {
    await database.connect();
    logger.info('Database connection established');
  }

  const server = app.listen(config.server.port, config.server.host, () => {
    logger.info(
      {
        host: config.server.host,
        port: config.server.port,
        environment: config.app.environment,
        databaseConfigured: database.configured,
      },
      'Parento backend started',
    );
  });

  server.requestTimeout = config.security.requestTimeoutMs;
  server.headersTimeout = config.security.headersTimeoutMs;
  server.keepAliveTimeout = config.security.keepAliveTimeoutMs;

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutdown requested');
    server.close(async (error) => {
      if (error) {
        logger.error({ err: error }, 'Graceful shutdown failed');
        process.exitCode = 1;
      }

      try {
        await database.close();
      } catch (databaseError) {
        logger.error({ err: databaseError }, 'Database shutdown failed');
        process.exitCode = 1;
      }

      if (error === undefined) process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start().catch((error: unknown) => {
  logger.error({ err: error }, 'Backend startup failed');
  process.exitCode = 1;
});
