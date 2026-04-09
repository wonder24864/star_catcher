import { router } from "../trpc";
import { authRouter } from "./auth";
import { userRouter } from "./user";
import { familyRouter } from "./family";
import { uploadRouter } from "./upload";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  family: familyRouter,
  upload: uploadRouter,
});

export type AppRouter = typeof appRouter;
