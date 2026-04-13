import { PrismaClient, type Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

async function main() {
  // ─── 1. Admin user ─────────────────────────────
  const password = process.env.ADMIN_DEFAULT_PASSWORD || "Admin123!";
  const hashed = await hash(password, 12);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: { role: "ADMIN", nickname: "管理员", password: hashed },
    create: {
      username: "admin",
      password: hashed,
      nickname: "管理员",
      role: "ADMIN",
    },
  });

  console.log("seed: admin user ready (username: admin)");

  // ─── 2. Built-in Skills ────────────────────────
  const skillsDir = path.resolve(process.cwd(), "skills");
  if (!fs.existsSync(skillsDir)) {
    console.log("seed: skills/ directory not found, skipping skill registration");
    return;
  }

  const dirs = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  let registered = 0;

  for (const dir of dirs) {
    const skillDir = path.join(skillsDir, dir.name);

    // Read schema.json for the canonical name (snake_case)
    const schemaPath = path.join(skillDir, "schema.json");
    if (!fs.existsSync(schemaPath)) continue;

    const manifestPath = path.join(skillDir, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;

    let schema: { name: string; description: string; parameters: Record<string, unknown> };
    let manifest: { name: string; version: string; description: string; author: string; timeout?: number };

    try {
      schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } catch {
      console.warn(`seed: skipping ${dir.name} — invalid JSON`);
      continue;
    }

    // DB name = schema.json name (snake_case), NOT manifest kebab-case
    const dbName = schema.name;
    const version = manifest.version;

    // Build bundleUrl from convention: skills/<kebab-name>/<kebab-name>-<version>.zip
    const bundleUrl = `skills/${manifest.name}/${manifest.name}-${version}.zip`;

    const functionSchema = schema as unknown as Prisma.InputJsonValue;
    const config: Prisma.InputJsonValue = manifest.timeout ? { timeout: manifest.timeout } : {};

    await prisma.skillDefinition.upsert({
      where: {
        name_version: { name: dbName, version },
      },
      update: {
        description: schema.description || manifest.description,
        author: manifest.author,
        functionSchema,
        bundleUrl,
        config,
        status: "ACTIVE",
        source: "BUILTIN",
        deletedAt: null,
      },
      create: {
        name: dbName,
        version,
        description: schema.description || manifest.description,
        author: manifest.author,
        functionSchema,
        bundleUrl,
        config,
        status: "ACTIVE",
        source: "BUILTIN",
      },
    });

    registered++;
  }

  console.log(`seed: ${registered} built-in skill(s) registered (source=BUILTIN, status=ACTIVE)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
