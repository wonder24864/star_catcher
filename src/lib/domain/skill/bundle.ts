/**
 * Skill Bundle — format definition and validation.
 *
 * A skill bundle consists of:
 *   manifest.json  — metadata (name, version, author, config)
 *   schema.json    — Canonical JSON Schema for function calling
 *   index.js       — Compiled skill code (must export execute function)
 *
 * See: docs/adr/008-agent-architecture.md
 */
import { z } from "zod";

// ─── Manifest ─────────────────────────────────────

export const skillManifestSchema = z.object({
  /** Kebab-case skill identifier */
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/, "Must be kebab-case, start with letter"),
  /** Semver version */
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, "Must be semver (e.g., 1.0.0)"),
  /** Human-readable description */
  description: z.string().min(1).max(500),
  /** Author name */
  author: z.string().min(1).max(100),
  /** Entry point file (default: index.js) */
  main: z.string().default("index.js"),
  /** Execution timeout in ms (1000-30000) */
  timeout: z.number().int().min(1000).max(30000).default(30000),
  /** Skill-specific config passed to execute() */
  config: z.record(z.unknown()).optional(),
});

export type SkillManifest = z.infer<typeof skillManifestSchema>;

// ─── Canonical JSON Schema (provider-agnostic) ────

/** JSON Schema property definition */
const jsonSchemaPropertySchema = z.object({
  type: z.string(),
  description: z.string().optional(),
  enum: z.array(z.string()).optional(),
  items: z.record(z.unknown()).optional(),
  default: z.unknown().optional(),
});

/** Canonical function calling schema */
export const canonicalSkillSchemaDefinition = z.object({
  /** Snake_case function name (for AI function calling) */
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "Must be snake_case, start with letter"),
  /** Function description for AI context */
  description: z.string().min(1).max(500),
  /** Parameters object schema */
  parameters: z.object({
    type: z.literal("object"),
    properties: z.record(jsonSchemaPropertySchema),
    required: z.array(z.string()).optional(),
  }),
});

export type CanonicalSkillSchema = z.infer<
  typeof canonicalSkillSchemaDefinition
>;

// ─── Bundle Validation ────────────────────────────

export interface BundleValidationResult {
  valid: boolean;
  errors: string[];
  manifest?: SkillManifest;
  schema?: CanonicalSkillSchema;
}

/**
 * Validate manifest.json content.
 */
export function validateManifest(
  content: unknown,
): { valid: true; data: SkillManifest } | { valid: false; error: string } {
  const result = skillManifestSchema.safeParse(content);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  const messages = result.error.issues.map(
    (i) => `${i.path.join(".")}: ${i.message}`,
  );
  return { valid: false, error: messages.join("; ") };
}

/**
 * Validate schema.json content.
 */
export function validateSchema(
  content: unknown,
): { valid: true; data: CanonicalSkillSchema } | { valid: false; error: string } {
  const result = canonicalSkillSchemaDefinition.safeParse(content);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  const messages = result.error.issues.map(
    (i) => `${i.path.join(".")}: ${i.message}`,
  );
  return { valid: false, error: messages.join("; ") };
}

/**
 * Check that compiled bundle code does not import Prisma (ADR-008 constraint).
 */
export function checkBundleNoPrisma(code: string): {
  clean: boolean;
  violations: string[];
} {
  const patterns = [
    /require\s*\(\s*['"]@prisma\/client['"]\s*\)/g,
    /from\s+['"]@prisma\/client['"]/g,
    /require\s*\(\s*['"]prisma['"]\s*\)/g,
  ];

  const violations: string[] = [];
  for (const pattern of patterns) {
    const matches = code.match(pattern);
    if (matches) {
      violations.push(...matches);
    }
  }

  return { clean: violations.length === 0, violations };
}
