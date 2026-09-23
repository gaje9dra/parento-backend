import pino from 'pino';
import { loadConfig } from '../config/env.js';

const config = loadConfig();

export const logger = pino({
  level: config.logging.level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'authorization',
      'cookie',
      'token',
      'accessToken',
      'refreshToken',
      'password',
      'privateKey',
      'secret',
      'apiKey',
      'databaseUrl',
    ],
    censor: '[REDACTED]',
  },
});
