import { randomUUID } from "crypto";
import { db } from "@/lib/infra/db";
import { auth } from "@/lib/domain/auth";
import { createLogger } from "@/lib/infra/logger";
import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { Context } from "./trpc";

const log = createLogger("trpc");

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<Context> {
  const requestId =
    opts.req.headers.get("x-request-id") || randomUUID().slice(0, 8);

  const authSession = await auth();
  const session = authSession?.user
    ? {
        userId: authSession.user.id,
        role: authSession.user.role,
        grade: authSession.user.grade ?? null,
        locale: authSession.user.locale,
      }
    : null;

  return {
    db,
    session,
    requestId,
    log: log.child({ requestId }),
  };
}
