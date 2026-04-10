import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { db } from "@/lib/infra/db";

export type Context = {
  db: typeof db;
  session: { userId: string; role: string; grade: string | null; locale: string } | null;
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
export const publicProcedure = t.procedure;

// Protected procedure: requires authenticated session
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
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
