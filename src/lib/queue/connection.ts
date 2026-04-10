/**
 * BullMQ Redis connection factory.
 *
 * BullMQ requires ioredis with maxRetriesPerRequest: null.
 * This is incompatible with the app's Redis singleton (maxRetriesPerRequest: 3),
 * so BullMQ gets its own connection factory.
 */

import IORedis from "ioredis";

export function createBullMQConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });
}
