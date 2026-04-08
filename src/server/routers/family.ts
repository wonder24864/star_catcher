import { z } from "zod";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { router, protectedProcedure } from "../trpc";

function generateInviteCode(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 6);
}

export const familyRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.db.familyMember.findMany({
      where: { userId: ctx.session.userId },
      include: {
        family: {
          include: {
            members: {
              include: {
                user: {
                  select: { id: true, nickname: true, role: true, grade: true },
                },
              },
            },
          },
        },
      },
    });
    return memberships.map((m) => ({
      ...m.family,
      myRole: m.role,
    }));
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(32) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const inviteCode = generateInviteCode();
      const family = await ctx.db.family.create({
        data: {
          name: input.name,
          inviteCode,
          inviteCodeExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          members: {
            create: {
              userId: ctx.session.userId,
              role: "OWNER",
            },
          },
        },
      });
      return family;
    }),

  refreshInviteCode: protectedProcedure
    .input(z.object({ familyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const membership = await ctx.db.familyMember.findUnique({
        where: {
          userId_familyId: {
            userId: ctx.session.userId,
            familyId: input.familyId,
          },
        },
      });
      if (!membership || membership.role !== "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const inviteCode = generateInviteCode();
      await ctx.db.family.update({
        where: { id: input.familyId },
        data: {
          inviteCode,
          inviteCodeExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      return { inviteCode };
    }),

  join: protectedProcedure
    .input(z.object({ inviteCode: z.string().length(6) }))
    .mutation(async ({ ctx, input }) => {
      const family = await ctx.db.family.findFirst({
        where: { inviteCode: input.inviteCode.toUpperCase() },
      });

      if (!family) {
        throw new TRPCError({ code: "NOT_FOUND", message: "INVALID_CODE" });
      }
      if (family.inviteCodeExpiresAt && family.inviteCodeExpiresAt < new Date()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "CODE_EXPIRED" });
      }

      const existing = await ctx.db.familyMember.findUnique({
        where: {
          userId_familyId: {
            userId: ctx.session.userId,
            familyId: family.id,
          },
        },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "ALREADY_MEMBER" });
      }

      await ctx.db.familyMember.create({
        data: {
          userId: ctx.session.userId,
          familyId: family.id,
          role: "MEMBER",
        },
      });
      return { familyId: family.id, familyName: family.name };
    }),

  removeMember: protectedProcedure
    .input(z.object({ familyId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const myMembership = await ctx.db.familyMember.findUnique({
        where: {
          userId_familyId: {
            userId: ctx.session.userId,
            familyId: input.familyId,
          },
        },
      });

      // Owner can remove others; members can only remove themselves
      if (!myMembership) throw new TRPCError({ code: "FORBIDDEN" });
      if (input.userId !== ctx.session.userId && myMembership.role !== "OWNER") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (input.userId === ctx.session.userId && myMembership.role === "OWNER") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "OWNER_CANNOT_LEAVE",
        });
      }

      await ctx.db.familyMember.delete({
        where: {
          userId_familyId: {
            userId: input.userId,
            familyId: input.familyId,
          },
        },
      });
      return { success: true };
    }),

  students: protectedProcedure
    .input(z.object({ familyId: z.string().optional() }).optional())
    .query(async ({ ctx }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const myFamilies = await ctx.db.familyMember.findMany({
        where: { userId: ctx.session.userId },
        select: { familyId: true },
      });
      const familyIds = myFamilies.map((f) => f.familyId);

      const studentMembers = await ctx.db.familyMember.findMany({
        where: {
          familyId: { in: familyIds },
          user: { role: "STUDENT" },
        },
        include: {
          user: {
            select: { id: true, nickname: true, grade: true },
          },
        },
      });

      // Deduplicate by user id
      const seen = new Set<string>();
      return studentMembers
        .filter((m) => {
          if (seen.has(m.user.id)) return false;
          seen.add(m.user.id);
          return true;
        })
        .map((m) => m.user);
    }),
});
