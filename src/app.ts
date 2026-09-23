import express from 'express';
import pinoHttp from 'pino-http';
import { apiRouter } from './routes/index.js';
import { logger } from './logging/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestContext } from './api/request-context.js';

export const app = express();

app.disable('x-powered-by');
app.use(requestContext);
app.use(express.json({ limit: '100kb' }));
app.use(
  pinoHttp({
    logger,
    autoLogging: true,
    redact: {
      req: {
        headers: ['authorization', 'cookie'],
      },
    },
  }),
);

app.use(apiRouter);
app.use(notFoundHandler);
app.use(errorHandler);
