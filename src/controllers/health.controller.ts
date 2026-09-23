import type { RequestHandler } from 'express';
import type { ApiSuccess } from '../api/contracts.js';
import { database } from '../app.js';

const successResponse = <T>(data: T, requestId: string): ApiSuccess<T> => ({
  data,
  requestId,
});

export const healthController: RequestHandler = (_req, res) => {
  res
    .status(200)
    .json(
      successResponse(
        { status: 'ok', service: 'parento-backend', version: '1' },
        res.locals.requestId,
      ),
    );
};

export const readinessController: RequestHandler = async (_req, res, next) => {
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
    if (!available) {
      res
        .status(503)
        .json(
          successResponse(
            {
              status: 'not_ready',
              service: 'parento-backend',
              version: '1',
              database: 'unavailable',
            },
            res.locals.requestId,
          ),
        );
      return;
    }

    res
      .status(200)
      .json(
        successResponse(
          {
            status: 'ready',
            service: 'parento-backend',
            version: '1',
            database: 'available',
          },
          res.locals.requestId,
        ),
      );
  } catch (error) {
    next(error);
  }
};
