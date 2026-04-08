import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import type { Context } from "./trpc";

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
