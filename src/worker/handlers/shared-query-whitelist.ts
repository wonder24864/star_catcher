/**
 * Shared IPC Query Whitelist for Agent handlers.
 *
 * Whitelisted DB queries that Skills can execute via IPC ctx.query().
 * Each query validates params and returns data.
 *
 * Extracted from diagnosis.ts / question-understanding.ts to eliminate duplication.
 * See: docs/sprints/sprint-9-skill-gap.md (Task 83)
 */

import { db } from "@/lib/infra/db";
import type { Subject } from "@prisma/client";

export const QUERY_WHITELIST: Record<
  string,
  (params: Record<string, unknown>) => Promise<unknown>
> = {
  searchKnowledgePoints: async (params) => {
    const keywords = params.keywords as string[];
    const subject = params.subject as string;
    const grade = params.grade as string | undefined;
    const schoolLevel = params.schoolLevel as string | undefined;
    const limit = (params.limit as number) ?? 10;

    const andConditions: Record<string, unknown>[] = [
      { deletedAt: null },
      { subject: subject as Subject },
    ];
    if (grade) andConditions.push({ grade });
    if (schoolLevel) andConditions.push({ schoolLevel });

    if (keywords.length > 0) {
      andConditions.push({
        OR: keywords.flatMap((kw) => [
          { name: { contains: kw, mode: "insensitive" as const } },
          { description: { contains: kw, mode: "insensitive" as const } },
        ]),
      });
    }

    const results = await db.knowledgePoint.findMany({
      where: { AND: andConditions },
      take: limit,
      orderBy: { depth: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        difficulty: true,
        depth: true,
        parent: { select: { name: true } },
      },
    });

    return results.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      difficulty: r.difficulty,
      depth: r.depth,
      parentName: r.parent?.name ?? null,
    }));
  },

  getErrorQuestionsForKPs: async (params) => {
    const knowledgePointIds = params.knowledgePointIds as string[];
    const studentId = params.studentId as string;
    const limit = (params.limit as number) ?? 20;
    if (!knowledgePointIds?.length || !studentId) return [];

    const results = await db.errorQuestion.findMany({
      where: {
        studentId,
        deletedAt: null,
        knowledgeMappings: {
          some: { knowledgePointId: { in: knowledgePointIds } },
        },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        content: true,
        knowledgeMappings: {
          select: { knowledgePointId: true },
          take: 1,
        },
      },
    });

    return results.map((r) => ({
      id: r.id,
      content: r.content ?? "",
      knowledgePointId: r.knowledgeMappings[0]?.knowledgePointId ?? null,
    }));
  },

  findKnowledgePointsByIds: async (params) => {
    const ids = params.ids as string[];
    if (!ids?.length) return [];

    const results = await db.knowledgePoint.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true, description: true },
    });
    return results.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? undefined,
    }));
  },
};
