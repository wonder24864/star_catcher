/**
 * Unit Tests: SkillRegistry + SkillDefinition tRPC Router
 *
 * Tests registry cache behavior, ACTIVE filtering, and CRUD operations.
 * Uses mocked Prisma client.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockCount = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/infra/db", () => ({
  db: {
    skillDefinition: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      count: (...args: unknown[]) => mockCount(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

import { SkillRegistry } from "@/lib/domain/skill/registry";

// ─── Test Data ────────────────────────────────────

const activeSkill1 = {
  id: "sk-1",
  name: "diagnose-error",
  version: "1.0.0",
  description: "Diagnose error patterns",
  author: "system",
  functionSchema: {
    name: "diagnose_error",
    description: "Analyze errors",
    parameters: {
      type: "object",
      properties: { question: { type: "string" } },
      required: ["question"],
    },
  },
  bundleUrl: "skills/diagnose-error/index.js",
  config: { timeout: 15000 },
  status: "ACTIVE",
  callCount: 42,
  avgDurationMs: 1500,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const activeSkill2 = {
  id: "sk-2",
  name: "review-scheduler",
  version: "1.0.0",
  description: "Schedule spaced repetition",
  author: "system",
  functionSchema: {
    name: "review_scheduler",
    description: "Schedule reviews",
    parameters: {
      type: "object",
      properties: { studentId: { type: "string" } },
    },
  },
  bundleUrl: "skills/review-scheduler/index.js",
  config: null,
  status: "ACTIVE",
  callCount: 0,
  avgDurationMs: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── SkillRegistry ────────────────────────────────

describe("SkillRegistry", () => {
  let registry: SkillRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([activeSkill1, activeSkill2]);
    // Create a mock PrismaClient-like object
    const mockDb = {
      skillDefinition: {
        findMany: mockFindMany,
      },
    };
    registry = new SkillRegistry(mockDb as never);
  });

  test("loads ACTIVE skills from DB on first access", async () => {
    const skills = await registry.getActiveSkills();

    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe("diagnose-error");
    expect(skills[1].name).toBe("review-scheduler");
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { status: "ACTIVE", deletedAt: null },
    });
  });

  test("caches skills after first load", async () => {
    await registry.getActiveSkills();
    await registry.getActiveSkills();

    // Should only query DB once
    expect(mockFindMany).toHaveBeenCalledTimes(1);
  });

  test("getSkillByName returns matching skill", async () => {
    const skill = await registry.getSkillByName("diagnose-error");

    expect(skill).not.toBeNull();
    expect(skill!.name).toBe("diagnose-error");
    expect(skill!.timeout).toBe(15000); // from config
  });

  test("getSkillByName returns null for unknown skill", async () => {
    const skill = await registry.getSkillByName("nonexistent");
    expect(skill).toBeNull();
  });

  test("getActiveSchemas returns canonical schemas", async () => {
    const schemas = await registry.getActiveSchemas();

    expect(schemas).toHaveLength(2);
    expect(schemas[0].name).toBe("diagnose_error");
    expect(schemas[1].name).toBe("review_scheduler");
  });

  test("refresh reloads from DB", async () => {
    await registry.getActiveSkills();
    expect(mockFindMany).toHaveBeenCalledTimes(1);

    // Refresh forces reload
    await registry.refresh();
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  test("invalidate clears cache, next access reloads", async () => {
    await registry.getActiveSkills();
    expect(mockFindMany).toHaveBeenCalledTimes(1);

    registry.invalidate();
    await registry.getActiveSkills();
    expect(mockFindMany).toHaveBeenCalledTimes(2);
  });

  test("uses default timeout when config has no timeout", async () => {
    const skill = await registry.getSkillByName("review-scheduler");
    expect(skill!.timeout).toBe(30000); // default
  });
});
