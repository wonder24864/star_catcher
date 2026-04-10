/**
 * Error Question Router
 * US-020: Browse error question list (filter, search, pagination)
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";

const PAGE_SIZE = 20;

const SubjectEnum = z.enum([
  "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
  "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
]);

const ContentTypeEnum = z.enum([
  "HOMEWORK", "EXERCISE", "DICTATION", "COPY", "ORAL", "OTHER",
]);

export const errorRouter = router({
  /**
   * List error questions with filters + pagination.
   * STUDENT: only own questions (studentId ignored).
   * PARENT: must specify studentId of a family member.
   */
  list: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
        subject: SubjectEnum.optional(),
        contentType: ContentTypeEnum.optional(),
        dateFrom: z.string().optional(), // YYYY-MM-DD
        dateTo: z.string().optional(),   // YYYY-MM-DD
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const { userId, role } = ctx.session!;

      let targetStudentId: string;

      if (role === "STUDENT") {
        targetStudentId = userId;
      } else if (role === "PARENT") {
        if (!input.studentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "studentId required for PARENT" });
        }
        // Verify parent-student family relationship
        const parentFamilies = await ctx.db.familyMember.findMany({
          where: { userId },
        });
        const familyIds = (parentFamilies as { familyId: string }[]).map((m) => m.familyId);
        const studentInFamily = await ctx.db.familyMember.findFirst({
          where: { userId: input.studentId, familyId: { in: familyIds } },
        });
        if (!studentInFamily) {
          throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
        }
        targetStudentId = input.studentId;
      } else {
        throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
      }

      const where: Record<string, unknown> = {
        studentId: targetStudentId,
        deletedAt: null,
      };

      if (input.subject) where.subject = input.subject;
      if (input.contentType) where.contentType = input.contentType;
      if (input.search) where.content = { contains: input.search };

      if (input.dateFrom || input.dateTo) {
        const createdAt: Record<string, Date> = {};
        if (input.dateFrom) createdAt.gte = new Date(`${input.dateFrom}T00:00:00.000Z`);
        if (input.dateTo) createdAt.lte = new Date(`${input.dateTo}T23:59:59.999Z`);
        where.createdAt = createdAt;
      }

      const [total, items] = await Promise.all([
        ctx.db.errorQuestion.count({ where }),
        ctx.db.errorQuestion.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
      ]);

      return {
        items,
        total,
        page: input.page,
        pageSize: PAGE_SIZE,
        totalPages: Math.ceil(total / PAGE_SIZE),
      };
    }),
});
