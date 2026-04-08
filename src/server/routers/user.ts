import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { compare, hash } from "bcryptjs";
import { router, protectedProcedure } from "../trpc";

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findFirst({
      where: { id: ctx.session.userId },
      select: {
        id: true,
        username: true,
        nickname: true,
        role: true,
        grade: true,
        locale: true,
        createdAt: true,
      },
    });
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    return user;
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        nickname: z.string().min(1).max(32).optional(),
        grade: z
          .enum([
            "PRIMARY_1", "PRIMARY_2", "PRIMARY_3", "PRIMARY_4", "PRIMARY_5", "PRIMARY_6",
            "JUNIOR_1", "JUNIOR_2", "JUNIOR_3",
            "SENIOR_1", "SENIOR_2", "SENIOR_3",
          ])
          .optional(),
        locale: z.enum(["zh", "en"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({
        where: { id: ctx.session.userId },
        data: input,
      });
      return { success: true };
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).regex(/[a-zA-Z]/).regex(/[0-9]/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: { id: ctx.session.userId },
        select: { password: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const valid = await compare(input.currentPassword, user.password);
      if (!valid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "WRONG_PASSWORD",
        });
      }

      const hashed = await hash(input.newPassword, 12);
      await ctx.db.user.update({
        where: { id: ctx.session.userId },
        data: { password: hashed },
      });
      return { success: true };
    }),
});
