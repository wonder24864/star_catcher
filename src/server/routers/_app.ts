import { router } from "../trpc";
import { authRouter } from "./auth";
import { userRouter } from "./user";
import { familyRouter } from "./family";
import { uploadRouter } from "./upload";
import { homeworkRouter } from "./homework";
import { parentRouter } from "./parent";
import { errorRouter } from "./error";

export const appRouter = router({
  auth: authRouter,
  user: userRouter,
  family: familyRouter,
  upload: uploadRouter,
  homework: homeworkRouter,
  parent: parentRouter,
  error: errorRouter,
});

export type AppRouter = typeof appRouter;
