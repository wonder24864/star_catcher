/**
 * Structured logging via pino.
 *
 * Usage:
 *   import { createLogger } from "@/lib/infra/logger";
 *   const log = createLogger("worker:diagnosis");
 *   log.info({ jobId, correlationId }, "Processing job");
 *
 * Configuration (env vars):
 *   LOG_LEVEL  — debug | info | warn | error (default: "debug")
 *   LOG_PRETTY — "true" for pino-pretty, else raw JSON (default: "true")
 *
 * In Docker: set LOG_PRETTY=true + LOG_LEVEL=debug for dev,
 *            LOG_PRETTY=false + LOG_LEVEL=info for production.
 */

import pino from "pino";

const pretty = process.env.LOG_PRETTY !== "false";

const logger = pino({
  level: process.env.LOG_LEVEL || "debug",
  transport: pretty
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss" } }
    : undefined,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  base: {
    service: process.env.WORKER_MODE === "true" ? "worker" : "app",
  },
});

export default logger;

/**
 * Create a child logger with a fixed module name.
 * All log lines from this logger automatically include `{ module: "..." }`.
 */
export function createLogger(module: string) {
  return logger.child({ module });
}
