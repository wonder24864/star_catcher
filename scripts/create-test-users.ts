/**
 * Dev utility: seed a linked parent + student pair for local testing.
 *
 * Creates / upserts:
 * - PARENT user `testjiazhang` (nickname 测试家长, password `test123`)
 * - STUDENT user `testxuesheng` (nickname 测试学生, grade PRIMARY_3, password `test123`)
 * - Family `测试家庭` with OWNER=parent, MEMBER=student
 * - ParentStudentConfig linking the two (default help-level / daily-task caps)
 *
 * Idempotent — safe to re-run on the same DB. NOT wired into `prisma db seed`
 * because the admin/skill seed runs unconditionally on first deploy and this
 * one is purely for local dev.
 *
 * Run:
 *   npx tsx scripts/create-test-users.ts
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await hash("test123", 12);

  const parent = await prisma.user.upsert({
    where: { username: "testjiazhang" },
    update: { password, role: "PARENT", nickname: "测试家长" },
    create: { username: "testjiazhang", password, role: "PARENT", nickname: "测试家长" },
  });

  const student = await prisma.user.upsert({
    where: { username: "testxuesheng" },
    update: { password, role: "STUDENT", nickname: "测试学生", grade: "PRIMARY_3" },
    create: {
      username: "testxuesheng",
      password,
      role: "STUDENT",
      nickname: "测试学生",
      grade: "PRIMARY_3",
    },
  });

  let family = await prisma.family.findFirst({ where: { name: "测试家庭", deletedAt: null } });
  if (!family) {
    family = await prisma.family.create({ data: { name: "测试家庭" } });
  }

  await prisma.familyMember.upsert({
    where: { userId_familyId: { userId: parent.id, familyId: family.id } },
    update: { role: "OWNER" },
    create: { userId: parent.id, familyId: family.id, role: "OWNER" },
  });
  await prisma.familyMember.upsert({
    where: { userId_familyId: { userId: student.id, familyId: family.id } },
    update: { role: "MEMBER" },
    create: { userId: student.id, familyId: family.id, role: "MEMBER" },
  });

  await prisma.parentStudentConfig.upsert({
    where: { parentId_studentId: { parentId: parent.id, studentId: student.id } },
    update: {},
    create: { parentId: parent.id, studentId: student.id },
  });

  console.log(`parent:  ${parent.username} (${parent.id})`);
  console.log(`student: ${student.username} (${student.id}, ${student.grade})`);
  console.log(`family:  ${family.name} (${family.id})`);
  console.log("password: test123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
