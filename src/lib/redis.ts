import Redis from "ioredis";

function createRedisClient() {
  return new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });
}

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

/**
 * Lazy-initialized Redis client singleton.
 */
export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;
