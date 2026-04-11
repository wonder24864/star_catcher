#!/usr/bin/env npx tsx
/**
 * Skill Scaffold CLI — generate template files for a new skill.
 *
 * Usage:
 *   npx tsx src/cli/skill-scaffold.ts --name my-skill --desc "Description" --author system
 *   npx tsx src/cli/skill-scaffold.ts   (interactive mode)
 *
 * Parameters can also include --param "name:type:description" (repeatable).
 */
import { scaffoldSkill } from "../lib/domain/skill/scaffold";
import path from "path";
import readline from "readline";

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function getArgs(flag: string): string[] {
  const results: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === flag && i + 1 < args.length) {
      results.push(args[i + 1]);
    }
  }
  return results;
}

async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  let name = getArg("--name");
  let description = getArg("--desc") || getArg("--description");
  let author = getArg("--author");
  const paramStrs = getArgs("--param");
  const outputDir = getArg("--output") || path.resolve(process.cwd(), "skills");

  // Interactive mode if required args missing
  if (!name || !description) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    if (!name) name = await prompt(rl, "Skill name (kebab-case): ");
    if (!description) description = await prompt(rl, "Description: ");
    if (!author) author = await prompt(rl, "Author [system]: ");

    // Collect parameters interactively
    if (paramStrs.length === 0) {
      console.log("\nDefine parameters (empty name to finish):");
      let adding = true;
      while (adding) {
        const pName = await prompt(rl, "  Parameter name: ");
        if (!pName) { adding = false; break; }
        const pType = await prompt(rl, "  Type (string/number/boolean) [string]: ");
        const pDesc = await prompt(rl, "  Description: ");
        paramStrs.push(`${pName}:${pType || "string"}:${pDesc}`);
      }
    }

    rl.close();
  }

  if (!author) author = "system";

  // Parse parameter definitions
  const parameters = paramStrs.map((s) => {
    const [pName, pType = "string", ...descParts] = s.split(":");
    return {
      name: pName,
      type: pType,
      description: descParts.join(":") || pName,
      required: true,
    };
  });

  const result = scaffoldSkill({
    name,
    description,
    author,
    parameters,
    outputDir,
  });

  if (result.success) {
    console.log(`\nScaffold created: ${result.skillDir}`);
    console.log("Files:");
    for (const f of result.files) {
      console.log(`  ${path.relative(process.cwd(), f)}`);
    }
    console.log("\nNext: edit execute.ts, then run skill-build to compile.");
  } else {
    console.error(`\nScaffold failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
