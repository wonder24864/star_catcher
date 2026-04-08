import { router } from "../trpc";

export const appRouter = router({
  // Sub-routers will be added as features are implemented:
  // auth: authRouter,     (Task 7)
  // family: familyRouter, (Task 9)
});

export type AppRouter = typeof appRouter;
