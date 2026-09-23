import type { RequestHandler } from 'express';

export const healthController: RequestHandler = (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'parento-backend', version: '1' });
};

export const readinessController: RequestHandler = (_req, res) => {
  res.status(200).json({ status: 'ready', service: 'parento-backend', version: '1' });
};
