import { router } from "../trpc";
import { authRouter } from "./auth";
import { userRouter } from "./user";
import { familyRouter } from "./family";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  family: familyRouter,
});

export type AppRouter = typeof appRouter;
