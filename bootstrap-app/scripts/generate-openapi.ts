// Writes docs/openapi.json so API changes show up as a reviewable diff.
// Deliberately does not load .env: the server URL must not depend on a local
// environment, or the artifact would churn between machines. Override with
// API_SERVER_URL when generating a spec for a specific deployment.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildApiDocument } from "../app/api/v1/_spec";

const DEFAULT_SERVER_URL = "http://localhost:3000";

async function main() {
  const serverUrl = process.env["API_SERVER_URL"] ?? DEFAULT_SERVER_URL;
  const target = resolve(import.meta.dirname, "../docs/openapi.json");

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(buildApiDocument(serverUrl), null, 2)}\n`, "utf8");

  console.log(`OpenAPI document written to ${target} (server: ${serverUrl})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
