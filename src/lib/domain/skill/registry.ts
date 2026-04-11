/**
 * SkillRegistry — loads ACTIVE skills from DB, caches in memory,
 * provides lookup for Agent Runner.
 *
 * Cache strategy: load all ACTIVE skills on first access, invalidate
 * on mutation (register/enable/disable). Agent Runner calls getActiveSkills()
 * to get the current tool set for function calling.
 *
 * See: docs/adr/008-agent-architecture.md
 */
import type { SkillDefinition, Prisma } from "@prisma/client";
import type { CanonicalSkillSchema } from "./bundle";

/** Minimal DB interface — accepts both PrismaClient and extended client */
interface SkillDB {
  skillDefinition: {
    findMany(args: {
      where: Prisma.SkillDefinitionWhereInput;
    }): Promise<SkillDefinition[]>;
  };
}

export interface CachedSkill {
  id: string;
  name: string;
  version: string;
  description: string;
  functionSchema: CanonicalSkillSchema;
  bundleUrl: string | null;
  config: Record<string, unknown>;
  timeout: number;
}

export class SkillRegistry {
  private db: SkillDB;
  private cache: Map<string, CachedSkill> | null = null;

  constructor(db: SkillDB) {
    this.db = db;
  }

  /**
   * Get all ACTIVE skills. Results are cached until invalidated.
   */
  async getActiveSkills(): Promise<CachedSkill[]> {
    if (!this.cache) {
      await this.refresh();
    }
    return Array.from(this.cache!.values());
  }

  /**
   * Get a single skill by name (must be ACTIVE).
   */
  async getSkillByName(name: string): Promise<CachedSkill | null> {
    if (!this.cache) {
      await this.refresh();
    }
    return this.cache!.get(name) ?? null;
  }

  /**
   * Get canonical schemas for all ACTIVE skills.
   * Used by Agent Runner to provide function calling tools.
   */
  async getActiveSchemas(): Promise<CanonicalSkillSchema[]> {
    const skills = await this.getActiveSkills();
    return skills.map((s) => s.functionSchema);
  }

  /**
   * Force refresh the cache from DB.
   */
  async refresh(): Promise<void> {
    const skills = await this.db.skillDefinition.findMany({
      where: { status: "ACTIVE", deletedAt: null },
    });

    this.cache = new Map();
    for (const skill of skills) {
      this.cache.set(skill.name, toCachedSkill(skill));
    }
  }

  /**
   * Invalidate the cache. Next getActiveSkills() call will reload from DB.
   */
  invalidate(): void {
    this.cache = null;
  }
}

function toCachedSkill(skill: SkillDefinition): CachedSkill {
  const config = (skill.config ?? {}) as Record<string, unknown>;
  return {
    id: skill.id,
    name: skill.name,
    version: skill.version,
    description: skill.description,
    functionSchema: skill.functionSchema as unknown as CanonicalSkillSchema,
    bundleUrl: skill.bundleUrl,
    config,
    timeout: typeof config.timeout === "number" ? config.timeout : 30000,
  };
}
