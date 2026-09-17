// Development fixtures. Idempotent, so it can run against a database that
// already has rows.
//
// `@bootstrap/database` is marked `server-only`, which throws under a plain
// `npx tsx` — the `seed` npm script passes `--conditions=react-server`.
import "dotenv/config";

import { db } from "@bootstrap/database";

const NOTES = [
  {
    title: "Release checklist",
    body: "Tag the release, publish the changelog, then announce it.",
    status: "PUBLISHED" as const,
  },
  {
    title: "Architecture notes",
    body: "Every feature is a vertical slice: domain, data, use-cases, contracts, api, client, ui.",
    status: "DRAFT" as const,
  },
];

async function main() {
  for (const note of NOTES) {
    await db.note.upsert({
      where: { title: note.title },
      update: {},
      create: note,
    });
  }

  console.log(`Seeded ${NOTES.length} notes.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
