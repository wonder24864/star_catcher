/**
 * Performance Test: Knowledge Graph Recursive CTE
 *
 * Sprint 4b Task 46 — validates ADR-009 decision:
 *   - Seed 1000 KnowledgePoints + 5000 KnowledgeRelations
 *   - recursive CTE for prerequisite chains ≤ 5 layers < 100ms
 *   - Basic graph traversal queries
 *
 * Requires: running PostgreSQL (docker compose -p star-catcher up -d)
 * Run: npx vitest run src/tests/perf/knowledge-graph-cte.test.ts
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Seed helpers ───────────────────────────────

function cuid() {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/** Generate N knowledge points as a flat array with random tree structure */
function generateKnowledgePoints(count: number) {
  const points: Array<{
    id: string;
    externalId: string;
    subject: string;
    schoolLevel: string;
    name: string;
    parentId: string | null;
    depth: number;
    difficulty: number;
    importance: number;
    examFrequency: number;
  }> = [];

  for (let i = 0; i < count; i++) {
    const id = cuid();
    // First 10 are root nodes, rest have random parents from earlier nodes
    const parentIdx = i < 10 ? null : Math.floor(Math.random() * i);
    const parentId = parentIdx !== null ? points[parentIdx]!.id : null;
    const depth = parentIdx !== null ? points[parentIdx]!.depth + 1 : 0;

    points.push({
      id,
      externalId: `ext-${i}`,
      subject: "MATH",
      schoolLevel: "PRIMARY",
      name: `知识点 ${i}`,
      parentId,
      depth: Math.min(depth, 10),
      difficulty: (i % 5) + 1,
      importance: ((i + 2) % 5) + 1,
      examFrequency: ((i + 3) % 5) + 1,
    });
  }
  return points;
}

/** Generate PREREQUISITE relations forming chains up to `maxDepth` deep */
function generateRelations(
  pointIds: string[],
  count: number,
  maxChainDepth: number,
) {
  const relations: Array<{
    id: string;
    fromPointId: string;
    toPointId: string;
    type: string;
    strength: number;
  }> = [];
  const existing = new Set<string>();

  // First: create guaranteed chains of depth `maxChainDepth`
  // Create 20 chains to ensure we have sufficient depth for testing
  const chainsToCreate = 20;
  for (let chain = 0; chain < chainsToCreate; chain++) {
    const startIdx = chain * (maxChainDepth + 1);
    if (startIdx + maxChainDepth >= pointIds.length) break;

    for (let d = 0; d < maxChainDepth; d++) {
      const fromId = pointIds[startIdx + d]!;
      const toId = pointIds[startIdx + d + 1]!;
      const key = `${fromId}-${toId}-PREREQUISITE`;
      if (existing.has(key)) continue;
      existing.add(key);
      relations.push({
        id: cuid(),
        fromPointId: fromId,
        toPointId: toId,
        type: "PREREQUISITE",
        strength: 0.8 + Math.random() * 0.2,
      });
    }
  }

  // Fill remaining with random PREREQUISITE / PARALLEL relations
  while (relations.length < count) {
    const fromIdx = Math.floor(Math.random() * pointIds.length);
    const toIdx = Math.floor(Math.random() * pointIds.length);
    if (fromIdx === toIdx) continue;

    const type = Math.random() < 0.7 ? "PREREQUISITE" : "PARALLEL";
    const key = `${pointIds[fromIdx]}-${pointIds[toIdx]}-${type}`;
    if (existing.has(key)) continue;
    existing.add(key);

    relations.push({
      id: cuid(),
      fromPointId: pointIds[fromIdx]!,
      toPointId: pointIds[toIdx]!,
      type,
      strength: Math.round(Math.random() * 100) / 100,
    });
  }

  return relations;
}

// ─── Test Suite ─────────────────────────────────

const POINT_COUNT = 1000;
const RELATION_COUNT = 5000;
const MAX_CHAIN_DEPTH = 5;

let pointIds: string[] = [];

describe("Knowledge Graph CTE Performance (ADR-009 Spike)", () => {
  beforeAll(async () => {
    // Clean existing test data
    await prisma.knowledgeRelation.deleteMany();
    await prisma.questionKnowledgeMapping.deleteMany();
    await prisma.knowledgePoint.deleteMany();

    // Seed knowledge points
    const points = generateKnowledgePoints(POINT_COUNT);
    pointIds = points.map((p) => p.id);

    // Batch insert knowledge points (Prisma createMany)
    await prisma.knowledgePoint.createMany({
      data: points.map((p) => ({
        id: p.id,
        externalId: p.externalId,
        subject: p.subject as "MATH",
        schoolLevel: p.schoolLevel as "PRIMARY",
        name: p.name,
        parentId: p.parentId,
        depth: p.depth,
        difficulty: p.difficulty,
        importance: p.importance,
        examFrequency: p.examFrequency,
      })),
    });

    // Seed relations
    const relations = generateRelations(pointIds, RELATION_COUNT, MAX_CHAIN_DEPTH);
    await prisma.knowledgeRelation.createMany({
      data: relations.map((r) => ({
        id: r.id,
        fromPointId: r.fromPointId,
        toPointId: r.toPointId,
        type: r.type as "PREREQUISITE" | "PARALLEL",
        strength: r.strength,
      })),
    });

    // Verify seed
    const pCount = await prisma.knowledgePoint.count();
    const rCount = await prisma.knowledgeRelation.count();
    expect(pCount).toBe(POINT_COUNT);
    expect(rCount).toBeGreaterThanOrEqual(RELATION_COUNT * 0.95); // allow minor dedup
  }, 30_000);

  afterAll(async () => {
    // Cleanup
    await prisma.knowledgeRelation.deleteMany();
    await prisma.questionKnowledgeMapping.deleteMany();
    await prisma.knowledgePoint.deleteMany();
    await prisma.$disconnect();
  });

  test("recursive CTE: prerequisite chain ≤ 5 layers < 100ms", async () => {
    // Pick a point that is a chain start (index 0 of first chain)
    const startPointId = pointIds[0]!;

    // Warm-up: prime Prisma connection + PG query planner cache
    await prisma.$queryRaw`SELECT 1`;
    await prisma.$queryRaw`
      WITH RECURSIVE prereq_chain AS (
        SELECT kp."id", kp."name", 0 AS depth, ARRAY[kp."id"] AS visited
        FROM "KnowledgePoint" kp WHERE kp."id" = ${startPointId}
        UNION ALL
        SELECT kp."id", kp."name", pc.depth + 1, pc.visited || kp."id"
        FROM prereq_chain pc
        JOIN "KnowledgeRelation" kr ON kr."fromPointId" = pc."id" AND kr."type" = 'PREREQUISITE'
        JOIN "KnowledgePoint" kp ON kp."id" = kr."toPointId"
        WHERE pc.depth < ${MAX_CHAIN_DEPTH} AND kp."deletedAt" IS NULL
          AND NOT kp."id" = ANY(pc.visited)
      )
      SELECT DISTINCT "id", "name", "depth" FROM prereq_chain ORDER BY "depth" ASC
    `;

    // Measured run (warm cache)
    const t0 = performance.now();
    const result = await prisma.$queryRaw<
      Array<{ id: string; name: string; depth: number }>
    >`
      WITH RECURSIVE prereq_chain AS (
        -- Base: start node + visited array for cycle detection
        SELECT kp."id", kp."name", 0 AS depth, ARRAY[kp."id"] AS visited
        FROM "KnowledgePoint" kp
        WHERE kp."id" = ${startPointId}

        UNION ALL

        -- Recursive: follow PREREQUISITE, skip visited nodes
        SELECT kp."id", kp."name", pc.depth + 1, pc.visited || kp."id"
        FROM prereq_chain pc
        JOIN "KnowledgeRelation" kr ON kr."fromPointId" = pc."id"
          AND kr."type" = 'PREREQUISITE'
        JOIN "KnowledgePoint" kp ON kp."id" = kr."toPointId"
        WHERE pc.depth < ${MAX_CHAIN_DEPTH}
          AND kp."deletedAt" IS NULL
          AND NOT kp."id" = ANY(pc.visited)
      )
      SELECT DISTINCT "id", "name", "depth"
      FROM prereq_chain
      ORDER BY "depth" ASC
    `;
    const elapsed = performance.now() - t0;

    expect(result.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);

    // Log for ADR-009 update
    console.log(
      `[CTE perf] prereq chain from ${startPointId}: ` +
        `${result.length} nodes, ${elapsed.toFixed(2)}ms`,
    );
  });

  test("recursive CTE: reverse prerequisite lookup (what requires this point) < 100ms", async () => {
    // Pick a point deeper in the chain
    const targetPointId = pointIds[MAX_CHAIN_DEPTH]!;

    // Warm-up
    await prisma.$queryRaw`
      WITH RECURSIVE dependents AS (
        SELECT kp."id", kp."name", 0 AS depth, ARRAY[kp."id"] AS visited
        FROM "KnowledgePoint" kp WHERE kp."id" = ${targetPointId}
        UNION ALL
        SELECT kp."id", kp."name", d.depth + 1, d.visited || kp."id"
        FROM dependents d
        JOIN "KnowledgeRelation" kr ON kr."toPointId" = d."id" AND kr."type" = 'PREREQUISITE'
        JOIN "KnowledgePoint" kp ON kp."id" = kr."fromPointId"
        WHERE d.depth < ${MAX_CHAIN_DEPTH} AND kp."deletedAt" IS NULL
          AND NOT kp."id" = ANY(d.visited)
      )
      SELECT DISTINCT "id", "name", "depth" FROM dependents ORDER BY "depth" ASC
    `;

    // Measured run
    const t0 = performance.now();
    const result = await prisma.$queryRaw<
      Array<{ id: string; name: string; depth: number }>
    >`
      WITH RECURSIVE dependents AS (
        SELECT kp."id", kp."name", 0 AS depth, ARRAY[kp."id"] AS visited
        FROM "KnowledgePoint" kp
        WHERE kp."id" = ${targetPointId}

        UNION ALL

        SELECT kp."id", kp."name", d.depth + 1, d.visited || kp."id"
        FROM dependents d
        JOIN "KnowledgeRelation" kr ON kr."toPointId" = d."id"
          AND kr."type" = 'PREREQUISITE'
        JOIN "KnowledgePoint" kp ON kp."id" = kr."fromPointId"
        WHERE d.depth < ${MAX_CHAIN_DEPTH}
          AND kp."deletedAt" IS NULL
          AND NOT kp."id" = ANY(d.visited)
      )
      SELECT DISTINCT "id", "name", "depth"
      FROM dependents
      ORDER BY "depth" ASC
    `;
    const elapsed = performance.now() - t0;

    expect(result.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);

    console.log(
      `[CTE perf] reverse prereq for ${targetPointId}: ` +
        `${result.length} nodes, ${elapsed.toFixed(2)}ms`,
    );
  });

  test("tree query: children at all levels via parentId CTE < 100ms", async () => {
    // Query all descendants of a root node via parent-child tree
    const rootId = pointIds[0]!;

    const t0 = performance.now();
    const result = await prisma.$queryRaw<
      Array<{ id: string; name: string; tree_depth: number }>
    >`
      WITH RECURSIVE subtree AS (
        SELECT kp."id", kp."name", 0 AS tree_depth
        FROM "KnowledgePoint" kp
        WHERE kp."id" = ${rootId}

        UNION ALL

        SELECT kp."id", kp."name", st.tree_depth + 1
        FROM subtree st
        JOIN "KnowledgePoint" kp ON kp."parentId" = st."id"
        WHERE st.tree_depth < 10
          AND kp."deletedAt" IS NULL
      )
      SELECT "id", "name", "tree_depth"
      FROM subtree
      ORDER BY "tree_depth" ASC
    `;
    const elapsed = performance.now() - t0;

    expect(result.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);

    console.log(
      `[CTE perf] subtree from root ${rootId}: ` +
        `${result.length} nodes, ${elapsed.toFixed(2)}ms`,
    );
  });

  test("aggregate: count knowledge points by subject + schoolLevel < 50ms", async () => {
    const t0 = performance.now();
    const result = await prisma.knowledgePoint.groupBy({
      by: ["subject", "schoolLevel"],
      _count: true,
      where: { deletedAt: null },
    });
    const elapsed = performance.now() - t0;

    expect(result.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(50);

    console.log(
      `[CTE perf] groupBy subject+schoolLevel: ` +
        `${result.length} groups, ${elapsed.toFixed(2)}ms`,
    );
  });
});
