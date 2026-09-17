import {
  GetParametersByPathCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const APP_PREFIX = "bootstrap";
const ROOT_STAGE = process.env.ROOT_STAGE ?? "dev";
const AWS_REGION = process.env.AWS_REGION ?? "eu-central-1";

function parseStage(): string | undefined {
  const args = process.argv.slice(2);
  let stage: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--stage" && args[i + 1]) {
      stage = args[++i];
    }
  }

  return stage;
}

async function fetchStageParams(
  client: SSMClient,
  stage: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();

  for (const subpath of ["config", "secret"] as const) {
    const path = `/${APP_PREFIX}/${stage}/${subpath}`;
    let nextToken: string | undefined;

    do {
      const response = await client.send(
        new GetParametersByPathCommand({
          Path: path,
          Recursive: true,
          WithDecryption: true,
          NextToken: nextToken,
        }),
      );

      for (const param of response.Parameters ?? []) {
        const key = param.Name?.split("/").pop();
        if (key && param.Value !== undefined) {
          result.set(key, param.Value);
          console.log(`Read value for ${param.Name}`);
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);
  }

  return result;
}

function formatDotenv(entries: Map<string, string>): string {
  const lines: string[] = [];

  for (const [key, value] of [...entries.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (/[\s"'\\$#]/.test(value)) {
      lines.push(
        `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
      );
    } else {
      lines.push(`${key}=${value}`);
    }
  }

  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}

async function main() {
  const stage = parseStage();
  const client = new SSMClient({ region: AWS_REGION });

  const merged = await fetchStageParams(client, ROOT_STAGE);

  if (stage && stage !== ROOT_STAGE) {
    const overlay = await fetchStageParams(client, stage);
    for (const [key, value] of overlay) {
      merged.set(key, value);
    }
  }

  const outPath = resolve(process.cwd(), ".env");
  writeFileSync(outPath, formatDotenv(merged), "utf8");
  console.log(`Wrote ${merged.size} parameter(s) to ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
