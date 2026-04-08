import { TRPCError } from "@trpc/server";
import { hash } from "bcryptjs";
import { router, publicProcedure } from "../trpc";
import { registerSchema } from "@/lib/validations/auth";

export const authRouter = router({
  register: publicProcedure
    .input(registerSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findFirst({
        where: { username: input.username },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "USERNAME_EXISTS",
        });
      }

      const hashedPassword = await hash(input.password, 12);

      const user = await ctx.db.user.create({
        data: {
          username: input.username,
          password: hashedPassword,
          nickname: input.nickname,
          role: input.role,
          grade: input.role === "STUDENT" ? input.grade : null,
        },
      });

      return { id: user.id, username: user.username };
    }),
});
