import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export const requestContext: RequestHandler = (req, res, next) => {
  const requestId =
    typeof req.id === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(req.id)
      ? req.id
      : randomUUID();

  res.setHeader('x-request-id', requestId);
  res.locals.requestId = requestId;
  next();
};
