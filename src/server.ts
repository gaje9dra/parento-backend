import { app } from './app.js';
import { loadConfig } from './config/env.js';
import { logger } from './logging/logger.js';

const config = loadConfig();

const server = app.listen(config.server.port, config.server.host, () => {
  logger.info(
    {
      host: config.server.host,
      port: config.server.port,
      environment: config.app.environment,
    },
    'Parento backend started',
  );
});

server.requestTimeout = config.security.requestTimeoutMs;
server.headersTimeout = config.security.headersTimeoutMs;
server.keepAliveTimeout = config.security.keepAliveTimeoutMs;

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
