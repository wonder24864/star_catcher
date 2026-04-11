#!/usr/bin/env npx tsx
/**
 * Skill Build CLI — validate, compile, and package a skill bundle.
 *
 * Usage:
 *   npx tsx src/cli/skill-build.ts skills/diagnose-error
 *   npx tsx src/cli/skill-build.ts skills/diagnose-error --upload   (build + upload to MinIO)
 *   npx tsx src/cli/skill-build.ts --all                            (build all skills)
 *   npx tsx src/cli/skill-build.ts --all --upload                   (build all + upload)
 */
import { buildSkill, uploadBundle } from "../lib/domain/skill/build";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const shouldUpload = args.includes("--upload");
const filteredArgs = args.filter((a) => a !== "--upload");

async function buildAndMaybeUpload(dir: string): Promise<boolean> {
  const result = await buildSkill({ skillDir: dir });

  if (!result.success) {
    console.error(`  FAILED:`);
    result.errors.forEach((e) => console.error(`    ${e}`));
    return false;
  }

  console.log(`  JS  → ${result.outputPath}`);
  if (result.zipPath) {
    console.log(`  ZIP → ${result.zipPath}`);
  }

  if (shouldUpload && result.zipPath) {
    try {
      const objectKey = await uploadBundle(result.zipPath, result.manifest!);
      console.log(`  S3  → ${objectKey}`);
    } catch (err) {
      console.error(`  Upload failed: ${err instanceof Error ? err.message : err}`);
      return false;
    }
  }

  return true;
}

async function main() {
  if (filteredArgs.includes("--all")) {
    const skillsDir = path.resolve(process.cwd(), "skills");
    if (!fs.existsSync(skillsDir)) {
      console.error("No skills/ directory found");
      process.exit(1);
    }

    const dirs = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(skillsDir, d.name));

    let failed = 0;
    for (const dir of dirs) {
      console.log(`\nBuilding: ${path.basename(dir)}`);
      const ok = await buildAndMaybeUpload(dir);
      if (!ok) failed++;
    }

    if (failed > 0) {
      console.error(`\n${failed} skill(s) failed`);
      process.exit(1);
    }
    console.log(`\nAll ${dirs.length} skill(s) built successfully`);
    return;
  }

  // Build a single skill
  const skillDir = filteredArgs[0];
  if (!skillDir) {
    console.error("Usage: skill-build <skill-dir> [--upload] | --all [--upload]");
    process.exit(1);
  }

  const resolvedDir = path.resolve(process.cwd(), skillDir);
  if (!fs.existsSync(resolvedDir)) {
    console.error(`Directory not found: ${resolvedDir}`);
    process.exit(1);
  }

  console.log(`Building: ${path.basename(resolvedDir)}`);
  const ok = await buildAndMaybeUpload(resolvedDir);

  if (ok) {
    console.log("\nBuild successful!");
  } else {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
