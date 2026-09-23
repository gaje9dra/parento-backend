import type { RequestHandler } from 'express';
import type { ApiSuccess } from '../api/contracts.js';

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

export const readinessController: RequestHandler = (_req, res) => {
  res
    .status(200)
    .json(
      successResponse(
        { status: 'ready', service: 'parento-backend', version: '1' },
        res.locals.requestId,
      ),
    );
};
