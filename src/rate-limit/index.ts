export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitDecision>;
}

/**
 * Extension point only. Production rate limiting is intentionally deferred.
 */
export const rateLimiter: RateLimiter = {
  async check(_key) {
    return { allowed: true };
  },
};
