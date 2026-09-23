import type { RequestHandler } from 'express';
import type { ApiSuccess } from '../api/contracts.js';
import type { Database } from '../db/index.js';
import { checkDatabaseReadiness } from '../db/readiness.js';

const successResponse = <T>(data: T, requestId: string): ApiSuccess<T> => ({
  data,
  requestId,
});

// prettier-ignore
export const createHealthController = (database: Database): {
  health: RequestHandler;
  readiness: RequestHandler;
} => ({
  health: (_req, res) => {
    res
      .status(200)
      .json(
        successResponse(
          { status: 'ok', service: 'parento-backend', version: '1' },
          res.locals.requestId,
        ),
      );
  },

  readiness: async (_req, res, next) => {
    try {
      const readiness = await checkDatabaseReadiness(database);
      const ready = readiness.configured && readiness.available;
      res
        .status(ready ? 200 : 503)
        .json(
          successResponse(
            {
              status: ready ? 'ready' : 'not_ready',
              service: 'parento-backend',
              version: '1',
              database: readiness.available
                ? 'available'
                : readiness.configured
                  ? 'unavailable'
                  : 'not_configured',
            },
            res.locals.requestId,
          ),
        );
    } catch (error) {
      next(error);
    }
  },
});
