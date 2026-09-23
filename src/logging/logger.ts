import pino from 'pino';
import { loadConfig } from '../config/env.js';

const config = loadConfig();

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'authorization',
      'token',
      'password',
      'privateKey',
      'secret',
    ],
    censor: '[REDACTED]',
  },
});
