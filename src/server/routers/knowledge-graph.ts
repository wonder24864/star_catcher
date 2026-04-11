/**
 * Knowledge Graph Management tRPC Router
 *
 * Admin-only procedures for managing knowledge points and relations:
 *   - list:              Paginated list with filters
 *   - getTree:           Recursive tree by subject/schoolLevel
 *   - getById:           Single knowledge point with relations + question count
 *   - search:            Fuzzy name search
 *   - create:            Create knowledge point
 *   - update:            Update knowledge point fields
 *   - delete:            Soft-delete with relation check
 *   - batchUpdateStatus: Batch approve/reject imported points
 *   - addRelation:       Add relation with cycle detection
 *   - removeRelation:    Remove a relation
 *
 * See: docs/adr/009-knowledge-graph-storage.md
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, adminProcedure } from "../trpc";

// ─── Shared Zod enums matching Prisma ───

const subjectEnum = z.enum([
  "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
  "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
]);

const gradeEnum = z.enum([
  "PRIMARY_1", "PRIMARY_2", "PRIMARY_3", "PRIMARY_4", "PRIMARY_5", "PRIMARY_6",
  "JUNIOR_1", "JUNIOR_2", "JUNIOR_3",
  "SENIOR_1", "SENIOR_2", "SENIOR_3",
]);

const schoolLevelEnum = z.enum(["PRIMARY", "JUNIOR", "SENIOR"]);

const relationTypeEnum = z.enum(["PREREQUISITE", "PARALLEL", "CONTAINS"]);

// Soft-delete base filter
const notDeleted = { deletedAt: null };

export const knowledgeGraphRouter = router({
  /** Paginated list with filters */
  list: adminProcedure
    .input(
      z.object({
        subject: subjectEnum.optional(),
        grade: gradeEnum.optional(),
        schoolLevel: schoolLevelEnum.optional(),
        parentId: z.string().optional(),
        search: z.string().optional(),
        importStatus: z.enum(["pending_review", "approved", "rejected"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Prisma.KnowledgePointWhereInput = {
        ...notDeleted,
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.grade ? { grade: input.grade } : {}),
        ...(input.schoolLevel ? { schoolLevel: input.schoolLevel } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: "insensitive" } },
                { description: { contains: input.search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(input.importStatus
          ? { metadata: { path: ["importStatus"], equals: input.importStatus } }
          : {}),
      };

      const [total, items] = await Promise.all([
        ctx.db.knowledgePoint.count({ where }),
        ctx.db.knowledgePoint.findMany({
          where,
          select: {
            id: true,
            name: true,
            subject: true,
            grade: true,
            schoolLevel: true,
            parentId: true,
            depth: true,
            difficulty: true,
            importance: true,
            examFrequency: true,
            description: true,
            metadata: true,
            createdAt: true,
            _count: { select: { questionMappings: true } },
          },
          orderBy: [{ depth: "asc" }, { name: "asc" }],
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);

      return { items, total, page: input.page, pageSize: input.pageSize };
    }),

  /** Recursive tree for a subject/schoolLevel */
  getTree: adminProcedure
    .input(
      z.object({
        subject: subjectEnum,
        schoolLevel: schoolLevelEnum,
        rootId: z.string().optional(),
        maxDepth: z.number().int().min(1).max(10).default(5),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Fetch all points matching subject/schoolLevel (filtered by root subtree if specified)
      const baseWhere: Prisma.KnowledgePointWhereInput = {
        ...notDeleted,
        subject: input.subject,
        schoolLevel: input.schoolLevel,
        depth: { lte: input.maxDepth },
      };

      const points = await ctx.db.knowledgePoint.findMany({
        where: baseWhere,
        select: {
          id: true,
          name: true,
          parentId: true,
          depth: true,
          difficulty: true,
          importance: true,
          examFrequency: true,
          metadata: true,
          _count: { select: { questionMappings: true } },
        },
        orderBy: [{ depth: "asc" }, { name: "asc" }],
        take: 1000, // Safety limit to avoid overloading client
      });

      // Build tree in memory
      type TreeNode = (typeof points)[number] & { children: TreeNode[] };
      const map = new Map<string, TreeNode>();
      const roots: TreeNode[] = [];

      for (const p of points) {
        map.set(p.id, { ...p, children: [] });
      }
      for (const node of map.values()) {
        if (node.parentId && map.has(node.parentId)) {
          map.get(node.parentId)!.children.push(node);
        } else if (!node.parentId || !map.has(node.parentId)) {
          roots.push(node);
        }
      }

      // If rootId specified, return only that subtree
      if (input.rootId) {
        const root = map.get(input.rootId);
        return root ? [root] : [];
      }

      return roots;
    }),

  /** Single knowledge point with relations and question count */
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const point = await ctx.db.knowledgePoint.findFirst({
        where: { id: input.id, ...notDeleted },
        include: {
          parent: { select: { id: true, name: true } },
          children: {
            where: notDeleted,
            select: { id: true, name: true, depth: true },
            orderBy: { name: "asc" },
          },
          relationsFrom: {
            select: {
              id: true,
              type: true,
              strength: true,
              toPoint: { select: { id: true, name: true } },
            },
          },
          relationsTo: {
            select: {
              id: true,
              type: true,
              strength: true,
              fromPoint: { select: { id: true, name: true } },
            },
          },
          _count: { select: { questionMappings: true } },
        },
      });

      if (!point) throw new TRPCError({ code: "NOT_FOUND" });
      return point;
    }),

  /** Fuzzy name search */
  search: adminProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        subject: subjectEnum.optional(),
        schoolLevel: schoolLevelEnum.optional(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.db.knowledgePoint.findMany({
        where: {
          ...notDeleted,
          name: { contains: input.query, mode: "insensitive" },
          ...(input.subject ? { subject: input.subject } : {}),
          ...(input.schoolLevel ? { schoolLevel: input.schoolLevel } : {}),
        },
        select: {
          id: true,
          name: true,
          description: true,
          subject: true,
          grade: true,
          schoolLevel: true,
          depth: true,
          difficulty: true,
          parent: { select: { id: true, name: true } },
        },
        take: input.limit,
        orderBy: { name: "asc" },
      });
    }),

  /** Create a knowledge point */
  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        subject: subjectEnum,
        grade: gradeEnum.optional(),
        schoolLevel: schoolLevelEnum,
        parentId: z.string().optional(),
        difficulty: z.number().int().min(1).max(5).default(3),
        importance: z.number().int().min(1).max(5).default(3),
        examFrequency: z.number().int().min(1).max(5).default(3),
        description: z.string().max(2000).optional(),
        externalId: z.string().max(128).optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Calculate depth from parent
      let depth = 0;
      if (input.parentId) {
        const parent = await ctx.db.knowledgePoint.findFirst({
          where: { id: input.parentId, ...notDeleted },
          select: { depth: true },
        });
        if (!parent) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Parent not found" });
        }
        depth = parent.depth + 1;
      }

      const point = await ctx.db.knowledgePoint.create({
        data: {
          name: input.name,
          subject: input.subject,
          grade: input.grade,
          schoolLevel: input.schoolLevel,
          parentId: input.parentId,
          depth,
          difficulty: input.difficulty,
          importance: input.importance,
          examFrequency: input.examFrequency,
          description: input.description,
          externalId: input.externalId,
          metadata: input.metadata ?? {},
        },
      });

      await ctx.db.adminLog.create({
        data: {
          adminId: ctx.session.userId,
          action: "CREATE_KNOWLEDGE_POINT",
          target: point.id,
          details: { name: input.name, subject: input.subject },
        },
      });

      return point;
    }),

  /** Update a knowledge point */
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(128).optional(),
        description: z.string().max(2000).optional(),
        parentId: z.string().nullable().optional(),
        difficulty: z.number().int().min(1).max(5).optional(),
        importance: z.number().int().min(1).max(5).optional(),
        examFrequency: z.number().int().min(1).max(5).optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.knowledgePoint.findFirst({
        where: { id: input.id, ...notDeleted },
        select: { id: true, depth: true, parentId: true },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const { id, ...data } = input;
      let depth: number | undefined;

      // Recalculate depth if parentId changes
      // NOTE: does not recursively update children depth — acceptable for admin manual edits;
      // batch tree reorganization would need a dedicated recursive update procedure.
      if (data.parentId !== undefined && data.parentId !== existing.parentId) {
        if (data.parentId === null) {
          depth = 0;
        } else {
          // Prevent setting self as parent
          if (data.parentId === id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot set self as parent" });
          }
          const newParent = await ctx.db.knowledgePoint.findFirst({
            where: { id: data.parentId, ...notDeleted },
            select: { depth: true },
          });
          if (!newParent) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "New parent not found" });
          }
          depth = newParent.depth + 1;
        }
      }

      const updated = await ctx.db.knowledgePoint.update({
        where: { id },
        data: {
          ...data,
          ...(depth !== undefined ? { depth } : {}),
        },
      });

      return updated;
    }),

  /** Soft-delete a knowledge point */
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const point = await ctx.db.knowledgePoint.findFirst({
        where: { id: input.id, ...notDeleted },
        select: {
          id: true,
          name: true,
          _count: { select: { questionMappings: true, children: true } },
        },
      });
      if (!point) throw new TRPCError({ code: "NOT_FOUND" });

      // Warn if has question mappings (return warning, still delete)
      const warnings: string[] = [];
      if (point._count.questionMappings > 0) {
        warnings.push(`Has ${point._count.questionMappings} question mapping(s)`);
      }
      if (point._count.children > 0) {
        warnings.push(`Has ${point._count.children} child knowledge point(s)`);
      }

      await ctx.db.knowledgePoint.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });

      await ctx.db.adminLog.create({
        data: {
          adminId: ctx.session.userId,
          action: "DELETE_KNOWLEDGE_POINT",
          target: input.id,
          details: { name: point.name, warnings },
        },
      });

      return { success: true, warnings };
    }),

  /** Batch update import status (approve / reject) */
  batchUpdateStatus: adminProcedure
    .input(
      z.object({
        ids: z.array(z.string()).min(1).max(200),
        importStatus: z.enum(["approved", "rejected"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify all IDs exist
      const existing = await ctx.db.knowledgePoint.findMany({
        where: { id: { in: input.ids }, ...notDeleted },
        select: { id: true },
      });
      if (existing.length !== input.ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${input.ids.length - existing.length} knowledge point(s) not found`,
        });
      }

      // Use raw update for JSONB metadata merge
      await ctx.db.$executeRaw`
        UPDATE "KnowledgePoint"
        SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${JSON.stringify({ importStatus: input.importStatus })}::jsonb,
            "updatedAt" = NOW()
        WHERE "id" = ANY(${input.ids})
          AND "deletedAt" IS NULL
      `;

      await ctx.db.adminLog.create({
        data: {
          adminId: ctx.session.userId,
          action: "BATCH_UPDATE_KP_STATUS",
          target: `${input.ids.length} points`,
          details: { status: input.importStatus, count: input.ids.length },
        },
      });

      return { updated: input.ids.length };
    }),

  /** Add a relation between two knowledge points (with cycle detection for PREREQUISITE) */
  addRelation: adminProcedure
    .input(
      z.object({
        fromId: z.string(),
        toId: z.string(),
        type: relationTypeEnum,
        strength: z.number().min(0).max(1).default(1.0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fromId === input.toId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot create self-relation" });
      }

      // Verify both points exist
      const [from, to] = await Promise.all([
        ctx.db.knowledgePoint.findFirst({ where: { id: input.fromId, ...notDeleted }, select: { id: true } }),
        ctx.db.knowledgePoint.findFirst({ where: { id: input.toId, ...notDeleted }, select: { id: true } }),
      ]);
      if (!from || !to) {
        throw new TRPCError({ code: "NOT_FOUND", message: "One or both knowledge points not found" });
      }

      // Cycle detection for PREREQUISITE type:
      // Check if toId can already reach fromId via existing PREREQUISITE chain
      if (input.type === "PREREQUISITE") {
        const cycleCheck = await ctx.db.$queryRaw<Array<{ hasCycle: boolean }>>`
          WITH RECURSIVE chain AS (
            SELECT "toPointId" AS id, ARRAY["fromPointId"] AS visited
            FROM "KnowledgeRelation"
            WHERE "fromPointId" = ${input.toId} AND "type" = 'PREREQUISITE'
            UNION ALL
            SELECT r."toPointId", chain.visited || r."fromPointId"
            FROM "KnowledgeRelation" r
            JOIN chain ON chain.id = r."fromPointId"
            WHERE r."type" = 'PREREQUISITE' AND NOT r."toPointId" = ANY(chain.visited)
          )
          SELECT EXISTS (SELECT 1 FROM chain WHERE id = ${input.fromId}) AS "hasCycle"
        `;
        if (cycleCheck[0]?.hasCycle) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Adding this prerequisite would create a cycle",
          });
        }
      }

      // Check duplicate
      const existing = await ctx.db.knowledgeRelation.findFirst({
        where: {
          fromPointId: input.fromId,
          toPointId: input.toId,
          type: input.type,
        },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Relation already exists" });
      }

      const relation = await ctx.db.knowledgeRelation.create({
        data: {
          fromPointId: input.fromId,
          toPointId: input.toId,
          type: input.type,
          strength: input.strength,
        },
      });

      return relation;
    }),

  /** Remove a relation */
  removeRelation: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const relation = await ctx.db.knowledgeRelation.findUnique({
        where: { id: input.id },
      });
      if (!relation) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.knowledgeRelation.delete({ where: { id: input.id } });

      return { success: true };
    }),

  /** Get presigned URL for PDF upload (KG import) */
  getImportUploadUrl: adminProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { getPresignedPutUrl } = await import("@/lib/infra/storage");
      const ext = input.filename.split(".").pop()?.toLowerCase() ?? "pdf";
      const objectKey = `kg-imports/${ctx.session.userId}/${Date.now()}.${ext}`;
      const { url } = await getPresignedPutUrl(objectKey, "application/pdf");
      return { url, objectKey };
    }),

  /** Start KG import: enqueue worker job after PDF upload */
  startImport: adminProcedure
    .input(
      z.object({
        fileUrl: z.string().min(1),
        bookTitle: z.string().min(1).max(200),
        subject: subjectEnum,
        schoolLevel: schoolLevelEnum,
        grade: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { enqueueKGImport } = await import("@/lib/infra/queue");
      const jobId = await enqueueKGImport({
        fileUrl: input.fileUrl,
        bookTitle: input.bookTitle,
        subject: input.subject as string,
        schoolLevel: input.schoolLevel as string,
        grade: input.grade,
        userId: ctx.session.userId as string,
        locale: (ctx.session.locale as string) ?? "zh",
      });
      return { jobId };
    }),
});

