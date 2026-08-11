// Prisma 7: клиент берётся из сгенерированного пакета и создаётся только
// через адаптер — из '@prisma/client' он больше не экспортируется
import { PrismaClient } from '@prisma/client-sqlite';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./database/database.sqlite' }),
});
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
