import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` only needs a syntactically valid URL; real connections use
// DATABASE_URL from the environment.
const databaseUrl = process.env["DATABASE_URL"] ?? "postgresql://localhost:5432/placeholder";

export default defineConfig({
  schema: "prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
