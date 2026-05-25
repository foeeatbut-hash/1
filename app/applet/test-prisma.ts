import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const p = await prisma.project.create({ data: { name: "test" } });
  console.log("project created", p.id);
  const tag = await prisma.tag.create({
    data: {
      identifier: "test-tag",
      projectId: p.id,
      equipmentId: undefined, // undefined is omitted
      department: "DEP",
      wbs: "WBS",
      fluid: "FLUID"
    },
    include: { equipment: true }
  });
  console.log("tag created", tag.id);
}
main().catch(console.error);
