import type { RequestHandler } from 'express';
import type { ApiSuccess } from '../api/contracts.js';
import type { Database } from '../db/index.js';

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
    if (!database.configured) {
      res
        .status(200)
        .json(
          successResponse(
            {
              status: 'ready',
              service: 'parento-backend',
              version: '1',
              database: 'not_configured',
            },
            res.locals.requestId,
          ),
        );
      return;
    }

    try {
      const available = await database.isReady();
      res
        .status(available ? 200 : 503)
        .json(
          successResponse(
            {
              status: available ? 'ready' : 'not_ready',
              service: 'parento-backend',
              version: '1',
              database: available ? 'available' : 'unavailable',
            },
            res.locals.requestId,
          ),
        );
    } catch (error) {
      next(error);
    }
  },
});
