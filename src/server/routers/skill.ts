/**
 * Skill Management tRPC Router
 *
 * Admin-only procedures for managing skill definitions:
 *   - list:         Query skills with status filter
 *   - get:          Get skill by ID
 *   - register:     Create new skill definition
 *   - update:       Update skill metadata or status
 *   - enable:       Set skill status to ACTIVE
 *   - disable:      Set skill status to DISABLED
 *   - getUploadUrl: Get presigned URL for bundle upload to MinIO
 *
 * All mutations invalidate the SkillRegistry cache.
 * All queries filter out soft-deleted records (deletedAt IS NULL).
 *
 * See: docs/adr/008-agent-architecture.md
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { canonicalSkillSchemaDefinition } from "@/lib/domain/skill/bundle";
import { SkillRegistry } from "@/lib/domain/skill/registry";

// ─── Singleton SkillRegistry (shared with Agent Runner) ───
let _registry: SkillRegistry | null = null;

/** Get or create the shared SkillRegistry singleton. */
export function getSkillRegistry(
  db: ConstructorParameters<typeof SkillRegistry>[0],
): SkillRegistry {
  if (!_registry) {
    _registry = new SkillRegistry(db);
  }
  return _registry;
}

// Soft-delete base filter
const notDeleted = { deletedAt: null };

export const skillRouter = router({
  /** List skills with optional status filter */
  list: adminProcedure
    .input(
      z.object({
        status: z
          .enum(["DRAFT", "ACTIVE", "DISABLED", "DEPRECATED"])
          .optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        ...notDeleted,
        ...(input.status ? { status: input.status } : {}),
      };

      const [total, skills] = await Promise.all([
        ctx.db.skillDefinition.count({ where }),
        ctx.db.skillDefinition.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);

      return {
        total,
        page: input.page,
        pageSize: input.pageSize,
        items: skills,
      };
    }),

  /** Get a single skill by ID */
  get: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const skill = await ctx.db.skillDefinition.findFirst({
        where: { id: input.id, ...notDeleted },
      });
      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Skill not found",
        });
      }
      return skill;
    }),

  /** Register a new skill definition */
  register: adminProcedure
    .input(
      z.object({
        name: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z][a-z0-9-]*$/),
        version: z.string().regex(/^\d+\.\d+\.\d+$/),
        description: z.string().min(1).max(500),
        author: z.string().min(1).max(100),
        functionSchema: canonicalSkillSchemaDefinition,
        bundleUrl: z.string().optional(),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Check for duplicate name+version (including soft-deleted)
      const existing = await ctx.db.skillDefinition.findUnique({
        where: {
          name_version: {
            name: input.name,
            version: input.version,
          },
        },
      });
      if (existing && !existing.deletedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Skill ${input.name}@${input.version} already exists`,
        });
      }

      const skill = await ctx.db.skillDefinition.create({
        data: {
          name: input.name,
          version: input.version,
          description: input.description,
          author: input.author,
          functionSchema: input.functionSchema,
          bundleUrl: input.bundleUrl,
          config: input.config ?? {},
          status: "DRAFT",
        },
      });

      // Invalidate registry cache
      getSkillRegistry(ctx.db).invalidate();

      return skill;
    }),

  /** Update skill metadata (not status — use enable/disable) */
  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        description: z.string().min(1).max(500).optional(),
        functionSchema: canonicalSkillSchemaDefinition.optional(),
        bundleUrl: z.string().optional(),
        config: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const skill = await ctx.db.skillDefinition.findFirst({
        where: { id, ...notDeleted },
      });
      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Skill not found",
        });
      }

      const updated = await ctx.db.skillDefinition.update({
        where: { id },
        data,
      });

      getSkillRegistry(ctx.db).invalidate();
      return updated;
    }),

  /** Enable a skill (set status to ACTIVE) */
  enable: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const skill = await ctx.db.skillDefinition.findFirst({
        where: { id: input.id, ...notDeleted },
      });
      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Skill not found",
        });
      }
      if (!skill.bundleUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot enable skill without a bundle URL",
        });
      }

      const updated = await ctx.db.skillDefinition.update({
        where: { id: input.id },
        data: { status: "ACTIVE" },
      });

      getSkillRegistry(ctx.db).invalidate();
      return updated;
    }),

  /** Disable a skill */
  disable: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const skill = await ctx.db.skillDefinition.findFirst({
        where: { id: input.id, ...notDeleted },
      });
      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Skill not found",
        });
      }

      const updated = await ctx.db.skillDefinition.update({
        where: { id: input.id },
        data: { status: "DISABLED" },
      });

      getSkillRegistry(ctx.db).invalidate();
      return updated;
    }),

  /** Get a presigned URL for uploading a skill bundle to MinIO */
  getUploadUrl: adminProcedure
    .input(
      z.object({
        skillName: z.string().min(1).max(64),
        version: z.string().regex(/^\d+\.\d+\.\d+$/),
      }),
    )
    .mutation(async ({ input }) => {
      const { getPresignedPutUrl } = await import("@/lib/infra/storage");
      const objectKey = `skills/${input.skillName}/${input.skillName}-${input.version}.zip`;
      const { url } = await getPresignedPutUrl(objectKey, "application/zip");
      return { url, objectKey };
    }),
});
