import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client";

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env["DATABASE_URL"] }),
  });

// `next dev` re-evaluates server modules on every change, which would open a new
// pool per reload until the database refuses connections.
const globalForPrisma = globalThis as unknown as {
  db: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.db ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.db = db;
}
