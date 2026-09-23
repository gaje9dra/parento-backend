import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';

export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : randomUUID();

  res.setHeader('x-request-id', requestId);
  res.locals.requestId = requestId;
  next();
};
