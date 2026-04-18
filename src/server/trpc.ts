import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { db } from "@/lib/infra/db";
import type { Logger } from "pino";

export type Context = {
  db: typeof db;
  session: { userId: string; role: string; grade: string | null; locale: string } | null;
  requestId: string;
  log: Logger;
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  sse: {
    ping: { enabled: true, intervalMs: 3_000 },
    client: { reconnectAfterInactivityMs: 5_000 },
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/**
 * Logging middleware — emits one pino line per tRPC call with path / type /
 * duration / userId. Runs once per HTTP call (queries/mutations) or once
 * per subscription open (NOT per yielded event). Attached to the base
 * procedure so every derived procedure inherits it automatically.
 *
 * Format example:
 *   [12:34:56] INFO: tRPC OK
 *     path: "homework.requestHelp"
 *     type: "mutation"
 *     durationMs: 42
 *     userId: "cmo2..."
 */
const loggingMiddleware = t.middleware(async ({ ctx, path, type, next }) => {
  const start = Date.now();
  const reqLog = ctx.log.child({ path, type });
  try {
    const result = await next({ ctx });
    reqLog.info(
      {
        durationMs: Date.now() - start,
        userId: ctx.session?.userId,
      },
      "tRPC OK",
    );
    return result;
  } catch (err) {
    // Expected auth / validation errors log at WARN, unexpected ones at ERROR
    const trpcCode =
      err instanceof TRPCError ? err.code : "INTERNAL_SERVER_ERROR";
    const isExpected =
      err instanceof TRPCError &&
      (err.code === "UNAUTHORIZED" ||
        err.code === "FORBIDDEN" ||
        err.code === "BAD_REQUEST" ||
        err.code === "NOT_FOUND" ||
        err.code === "CONFLICT" ||
        err.code === "TOO_MANY_REQUESTS");
    const logFn = isExpected ? reqLog.warn.bind(reqLog) : reqLog.error.bind(reqLog);
    logFn(
      {
        durationMs: Date.now() - start,
        userId: ctx.session?.userId,
        code: trpcCode,
        err: err instanceof Error ? err.message : String(err),
      },
      "tRPC FAIL",
    );
    throw err;
  }
});

const baseProcedure = t.procedure.use(loggingMiddleware);

export const publicProcedure = baseProcedure;

// Protected procedure: requires authenticated session
export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

// Parent-only procedure
export const parentProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.role !== "PARENT") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

// Admin-only procedure
export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});

// Student-only procedure
export const studentProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.session.role !== "STUDENT") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx });
});
