import "dotenv/config";
// @ts-ignore
import { defineConfig, env } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // @ts-ignore
    url: env("DATABASE_URL") || "file:./prisma/database.sqlite",
  },
});
