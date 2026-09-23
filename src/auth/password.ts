import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 32;
const MAXMEM = 64 * 1024 * 1024;
const SALT_LENGTH = 16;
const MIN_PASSWORD_LENGTH = 15;
const MAX_PASSWORD_LENGTH = 256;

export const PASSWORD_POLICY = {
  minLength: MIN_PASSWORD_LENGTH,
  maxLength: MAX_PASSWORD_LENGTH,
} as const;

const validatePassword = (password: string): void => {
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new Error(
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }
};

export class PasswordHasher {
  async hash(password: string): Promise<string> {
    validatePassword(password);
    const salt = randomBytes(SALT_LENGTH);
    const derivedKey = (await scrypt(password, salt, KEY_LENGTH, {
      N,
      r: R,
      p: P,
      maxmem: MAXMEM,
    })) as Buffer;

    return [
      'scrypt',
      `N=${N}`,
      `r=${R}`,
      `p=${P}`,
      salt.toString('base64url'),
      derivedKey.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    if (password.length > MAX_PASSWORD_LENGTH) return false;

    const parts = encodedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const [, nPart, rPart, pPart, saltPart, hashPart] = parts;
    const n = Number(nPart?.replace('N=', ''));
    const r = Number(rPart?.replace('r=', ''));
    const p = Number(pPart?.replace('p=', ''));

    if (
      !Number.isSafeInteger(n) ||
      !Number.isSafeInteger(r) ||
      !Number.isSafeInteger(p) ||
      saltPart === undefined ||
      hashPart === undefined ||
      n < 2 ** 13 ||
      r < 1 ||
      p < 1
    ) {
      return false;
    }

    try {
      const salt = Buffer.from(saltPart, 'base64url');
      const expected = Buffer.from(hashPart, 'base64url');
      if (salt.length < 16 || expected.length !== KEY_LENGTH) return false;

      const derived = (await scrypt(password, salt, expected.length, {
        N: n,
        r,
        p,
        maxmem: MAXMEM,
      })) as Buffer;

      return timingSafeEqual(expected, derived);
    } catch {
      return false;
    }
  }
}
