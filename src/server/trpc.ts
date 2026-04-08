import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";

export type Context = {
  db: typeof db;
  session: { userId: string; role: string; grade: string | null; locale: string } | null;
};

export async function createContext(): Promise<Context> {
  const authSession = await auth();
  const session = authSession?.user
    ? {
        userId: authSession.user.id,
        role: authSession.user.role,
        grade: authSession.user.grade ?? null,
        locale: authSession.user.locale,
      }
    : null;
  return { db, session };
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Protected procedure: requires authenticated session
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});
