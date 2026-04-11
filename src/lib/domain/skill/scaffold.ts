/**
 * Skill Scaffold — generates template files for a new skill.
 *
 * Creates:
 *   manifest.json  — skill metadata
 *   schema.json    — canonical function calling schema
 *   execute.ts     — skill entry point template
 */
import fs from "fs";
import path from "path";

export interface ScaffoldOptions {
  /** Kebab-case skill name (e.g., "diagnose-error") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Author name */
  author: string;
  /** Parameter definitions for schema.json */
  parameters?: Array<{
    name: string;
    type: string;
    description: string;
    required?: boolean;
  }>;
  /** Output directory (skill files written to outputDir/name/) */
  outputDir: string;
}

export interface ScaffoldResult {
  success: boolean;
  skillDir: string;
  files: string[];
  error?: string;
}

/**
 * Generate scaffold files for a new skill.
 */
export function scaffoldSkill(options: ScaffoldOptions): ScaffoldResult {
  const { name, description, author, parameters = [], outputDir } = options;
  const skillDir = path.join(outputDir, name);
  const files: string[] = [];

  try {
    // Create skill directory
    fs.mkdirSync(skillDir, { recursive: true });

    // ─── manifest.json ────────────────────
    const manifest = {
      name,
      version: "1.0.0",
      description,
      author,
      main: "index.js",
      timeout: 30000,
    };
    const manifestPath = path.join(skillDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    files.push(manifestPath);

    // ─── schema.json ──────────────────────
    const snakeName = name.replace(/-/g, "_");
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of parameters) {
      properties[param.name] = {
        type: param.type,
        description: param.description,
      };
      if (param.required !== false) {
        required.push(param.name);
      }
    }

    const schema = {
      name: snakeName,
      description,
      parameters: {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    };
    const schemaPath = path.join(skillDir, "schema.json");
    fs.writeFileSync(schemaPath, JSON.stringify(schema, null, 2) + "\n");
    files.push(schemaPath);

    // ─── execute.ts ───────────────────────
    const paramTypes = parameters
      .map((p) => `  ${p.name}${p.required === false ? "?" : ""}: ${tsType(p.type)};`)
      .join("\n");

    const inputInterface = parameters.length > 0
      ? `interface SkillInput {\n${paramTypes}\n}`
      : `interface SkillInput {\n  [key: string]: unknown;\n}`;

    const executeTs = `/**
 * Skill: ${name}
 * ${description}
 */

${inputInterface}

interface SkillContext {
  callAI(operation: string, params: Record<string, unknown>): Promise<unknown>;
  readMemory(method: string, params: Record<string, unknown>): Promise<unknown>;
  writeMemory(method: string, params: Record<string, unknown>): Promise<void>;
  config: Readonly<Record<string, unknown>>;
  context: Readonly<{
    studentId: string;
    sessionId?: string;
    traceId: string;
    locale: string;
    grade?: string;
  }>;
}

module.exports.execute = async function execute(
  input: SkillInput,
  ctx: SkillContext,
): Promise<unknown> {
  // TODO: Implement skill logic
  return { message: "Hello from ${name}" };
};
`;
    const executePath = path.join(skillDir, "execute.ts");
    fs.writeFileSync(executePath, executeTs);
    files.push(executePath);

    return { success: true, skillDir, files };
  } catch (err) {
    return {
      success: false,
      skillDir,
      files,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Map JSON Schema types to TypeScript types */
function tsType(jsonType: string): string {
  switch (jsonType) {
    case "string":
      return "string";
    case "number":
    case "integer":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "unknown[]";
    case "object":
      return "Record<string, unknown>";
    default:
      return "unknown";
  }
}
