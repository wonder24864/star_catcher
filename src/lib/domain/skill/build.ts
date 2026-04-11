/**
 * Skill Build — validates, compiles, and packages a skill bundle.
 *
 * Steps:
 *   1. Read and validate manifest.json
 *   2. Read and validate schema.json
 *   3. Compile execute.ts → index.js via esbuild
 *   4. Check compiled code for Prisma imports (banned)
 *   5. Package into ZIP bundle (manifest.json + schema.json + index.js)
 *
 * Optional: upload ZIP to MinIO via uploadBundle().
 *
 * See: docs/adr/008-agent-architecture.md
 */
import fs from "fs";
import path from "path";
import { build } from "esbuild";
import archiver from "archiver";
import {
  validateManifest,
  validateSchema,
  checkBundleNoPrisma,
  type SkillManifest,
  type CanonicalSkillSchema,
} from "./bundle";

export interface BuildOptions {
  /** Path to skill source directory (contains manifest.json, schema.json, execute.ts) */
  skillDir: string;
  /** If true, create a ZIP bundle after compilation (default: true) */
  zip?: boolean;
}

export interface BuildResult {
  success: boolean;
  /** Path to compiled index.js */
  outputPath?: string;
  /** Path to ZIP bundle (if zip option enabled) */
  zipPath?: string;
  manifest?: SkillManifest;
  schema?: CanonicalSkillSchema;
  errors: string[];
}

/**
 * Build a skill from source directory.
 */
export async function buildSkill(options: BuildOptions): Promise<BuildResult> {
  const { skillDir, zip = true } = options;

  // ─── 1. Validate manifest.json ──────────
  const manifestPath = path.join(skillDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return { success: false, errors: ["manifest.json not found"] };
  }

  let manifest: SkillManifest;
  try {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const result = validateManifest(raw);
    if (!result.valid) {
      return { success: false, errors: [`manifest.json: ${result.error}`] };
    }
    manifest = result.data;
  } catch (err) {
    return {
      success: false,
      errors: [`manifest.json parse error: ${err instanceof Error ? err.message : err}`],
    };
  }

  // ─── 2. Validate schema.json ────────────
  const schemaPath = path.join(skillDir, "schema.json");
  if (!fs.existsSync(schemaPath)) {
    return { success: false, errors: ["schema.json not found"] };
  }

  let schema: CanonicalSkillSchema;
  try {
    const raw = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const result = validateSchema(raw);
    if (!result.valid) {
      return { success: false, errors: [`schema.json: ${result.error}`] };
    }
    schema = result.data;
  } catch (err) {
    return {
      success: false,
      errors: [`schema.json parse error: ${err instanceof Error ? err.message : err}`],
    };
  }

  // ─── 3. Compile execute.ts → index.js ───
  const entryPoint = path.join(skillDir, "execute.ts");
  const outputPath = path.join(skillDir, manifest.main);

  if (!fs.existsSync(entryPoint)) {
    // Try .js fallback (bundle might already be compiled)
    const jsEntry = path.join(skillDir, "execute.js");
    if (!fs.existsSync(jsEntry)) {
      return { success: false, errors: ["execute.ts or execute.js not found"] };
    }
    fs.copyFileSync(jsEntry, outputPath);
  } else {
    try {
      await build({
        entryPoints: [entryPoint],
        outfile: outputPath,
        bundle: false,
        platform: "node",
        format: "cjs",
        target: "node20",
        loader: { ".ts": "ts" },
        logLevel: "silent",
      });
    } catch (err) {
      return {
        success: false,
        errors: [`esbuild compilation failed: ${err instanceof Error ? err.message : err}`],
      };
    }
  }

  // ─── 4. Check for Prisma imports ────────
  const compiledCode = fs.readFileSync(outputPath, "utf-8");
  const prismaCheck = checkBundleNoPrisma(compiledCode);
  if (!prismaCheck.clean) {
    fs.unlinkSync(outputPath);
    return {
      success: false,
      errors: [
        `Prisma imports detected in compiled bundle (banned per ADR-008): ${prismaCheck.violations.join(", ")}`,
      ],
    };
  }

  // ─── 5. Package into ZIP ────────────────
  let zipPath: string | undefined;
  if (zip) {
    try {
      zipPath = await createZipBundle(skillDir, manifest, outputPath, schemaPath, manifestPath);
    } catch (err) {
      return {
        success: false,
        errors: [`ZIP creation failed: ${err instanceof Error ? err.message : err}`],
      };
    }
  }

  return { success: true, outputPath, zipPath, manifest, schema, errors: [] };
}

/**
 * Create a ZIP bundle containing manifest.json, schema.json, and index.js.
 */
async function createZipBundle(
  skillDir: string,
  manifest: SkillManifest,
  indexPath: string,
  schemaPath: string,
  manifestPath: string,
): Promise<string> {
  const zipName = `${manifest.name}-${manifest.version}.zip`;
  const zipPath = path.join(skillDir, zipName);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  return new Promise<string>((resolve, reject) => {
    output.on("close", () => resolve(zipPath));
    archive.on("error", reject);
    archive.pipe(output);

    archive.file(manifestPath, { name: "manifest.json" });
    archive.file(schemaPath, { name: "schema.json" });
    archive.file(indexPath, { name: manifest.main });

    archive.finalize();
  });
}

/**
 * Upload a ZIP bundle to MinIO and return the object key.
 * Used by skill-build CLI with --upload flag.
 */
export async function uploadBundle(
  zipPath: string,
  manifest: SkillManifest,
): Promise<string> {
  // Dynamic import to avoid requiring MinIO env vars at import time
  const { getMinioClient } = await import("@/lib/infra/storage/minio");
  const { ensureBucket } = await import("@/lib/infra/storage");

  await ensureBucket();

  const objectKey = `skills/${manifest.name}/${manifest.name}-${manifest.version}.zip`;
  const client = getMinioClient();
  const bucket = process.env.MINIO_BUCKET || "star-catcher";

  const fileStream = fs.createReadStream(zipPath);
  const stat = fs.statSync(zipPath);

  await client.putObject(bucket, objectKey, fileStream, stat.size, {
    "Content-Type": "application/zip",
  });

  return objectKey;
}
