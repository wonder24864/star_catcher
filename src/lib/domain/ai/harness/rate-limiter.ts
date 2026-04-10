/**
 * Rate limiter using Redis sliding window.
 * Enforces per-user limits: 5 calls/minute, 100 calls/day.
 */

// Redis client will be lazy-loaded to avoid import-time failures in tests
let redisModule: typeof import("@/lib/infra/redis") | null = null;

async function getRedis() {
  if (!redisModule) {
    redisModule = await import("@/lib/infra/redis");
  }
  return redisModule.redis;
}

const MINUTE_LIMIT = 5;
const MINUTE_WINDOW = 60; // seconds
const DAILY_LIMIT = 100;
const DAILY_WINDOW = 86400; // seconds

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining calls in the current window */
  remaining: number;
  /** Seconds until the limit resets */
  resetInSeconds: number;
}

/**
 * Check and consume a rate limit slot for a user.
 * Uses Redis sorted sets with timestamps as scores for sliding window.
 */
export async function checkRateLimit(userId: string): Promise<RateLimitResult> {
  const redis = await getRedis();
  const now = Date.now();
  const minuteKey = `ratelimit:minute:${userId}`;
  const dailyKey = `ratelimit:daily:${userId}`;

  // Check minute limit
  const minuteWindowStart = now - MINUTE_WINDOW * 1000;
  await redis.zremrangebyscore(minuteKey, 0, minuteWindowStart);
  const minuteCount = await redis.zcard(minuteKey);

  if (minuteCount >= MINUTE_LIMIT) {
    // Find oldest entry to calculate reset time
    const oldest = await redis.zrange(minuteKey, 0, 0, "WITHSCORES");
    const resetMs = oldest.length >= 2 ? Number(oldest[1]) + MINUTE_WINDOW * 1000 - now : MINUTE_WINDOW * 1000;
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil(resetMs / 1000),
    };
  }

  // Check daily limit
  const dailyWindowStart = now - DAILY_WINDOW * 1000;
  await redis.zremrangebyscore(dailyKey, 0, dailyWindowStart);
  const dailyCount = await redis.zcard(dailyKey);

  if (dailyCount >= DAILY_LIMIT) {
    const oldest = await redis.zrange(dailyKey, 0, 0, "WITHSCORES");
    const resetMs = oldest.length >= 2 ? Number(oldest[1]) + DAILY_WINDOW * 1000 - now : DAILY_WINDOW * 1000;
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil(resetMs / 1000),
    };
  }

  // Consume a slot
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;
  await redis.zadd(minuteKey, now, member);
  await redis.expire(minuteKey, MINUTE_WINDOW + 1);
  await redis.zadd(dailyKey, now, member);
  await redis.expire(dailyKey, DAILY_WINDOW + 1);

  return {
    allowed: true,
    remaining: Math.min(MINUTE_LIMIT - minuteCount - 1, DAILY_LIMIT - dailyCount - 1),
    resetInSeconds: MINUTE_WINDOW,
  };
}
