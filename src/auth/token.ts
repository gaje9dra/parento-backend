import { createHash, randomBytes } from 'node:crypto';

export const generateOpaqueToken = (): string =>
  randomBytes(32).toString('base64url');

export const hashOpaqueToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');
