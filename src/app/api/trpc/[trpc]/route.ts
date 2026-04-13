import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/routers/_app";
import { createContext } from "@/server/context";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("trpc");

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext,
    onError({ path, error, ctx }) {
      const reqLog = ctx?.log ?? log;
      reqLog.error(
        { path, code: error.code, cause: error.cause },
        error.message,
      );
    },
  });

export { handler as GET, handler as POST };
