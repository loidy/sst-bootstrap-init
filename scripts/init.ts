import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { parseAnswers, quickPreset, type Answers } from "./answers.ts";
import { estimateCost, formatCostSummary } from "./cost.ts";
import { generateProject } from "./generate/index.ts";
import { buildPlan } from "./plan.ts";
import { promptAdvanced, promptConfirm, promptProject } from "./prompts/index.ts";
import { UserCancelledError } from "./util/log.ts";
import { assertTemplatesExist } from "./util/paths.ts";

export type CliOptions = {
  configPath?: string;
  yes: boolean;
  dryRun: boolean;
};

export function parseArgv(argv: string[]): CliOptions {
  const options: CliOptions = { yes: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--yes" || arg === "-y") {
      options.yes = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--config" && argv[index + 1]) {
      options.configPath = argv[++index];
    } else if (arg?.startsWith("--config=")) {
      options.configPath = arg.slice("--config=".length);
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(`Usage: bootstrap-init [--config answers.json] [--yes] [--dry-run]

Creates <slug>-app, <slug>-root-project and <slug>-vault from the templates
in this package.

`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function loadConfig(path: string): Answers {
  const raw = JSON.parse(readFileSync(resolve(path), "utf8")) as unknown;
  return parseAnswers(raw);
}

function summaryFor(answers: Answers): string {
  const plan = buildPlan(answers);
  const estimate = estimateCost(answers);
  return [
    `Project     ${plan.names.displayName} (${plan.names.slug})`,
    `Target      ${plan.targetDirectory}`,
    `Region      ${plan.awsRegion}`,
    `Domain      ${plan.rootDomain}`,
    `Database    ${plan.database.kind} / ${plan.database.name}`,
    `Stages      ${plan.stages.map((stage) => `${stage.name}${stage.productionLevel ? "*" : ""}`).join(", ")}`,
    `Review PRs  ${plan.reviewStages ? "yes" : "no"}`,
    `Bucket      ${plan.s3.bucketPrefix}-<stage>`,
    "",
    formatCostSummary(estimate),
  ].join("\n");
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgv(argv);
  assertTemplatesExist();

  p.intro("bootstrap-init");

  let answers: Answers;
  if (options.configPath) {
    answers = loadConfig(options.configPath);
    answers = {
      ...answers,
      targetDirectory: resolve(answers.targetDirectory),
    };
  } else {
    const project = await promptProject();
    project.targetDirectory = resolve(project.targetDirectory);
    if (project.mode === "quick") {
      const rootDomain = `${project.projectName}.example`;
      answers = quickPreset({ ...project, rootDomain });
    } else {
      answers = await promptAdvanced(project);
      answers.targetDirectory = resolve(answers.targetDirectory);
    }
  }

  answers = parseAnswers(answers);
  const summary = summaryFor(answers);

  if (!options.yes) {
    const confirmed = await promptConfirm(summary);
    if (!confirmed) {
      p.cancel("No files written.");
      return;
    }
  } else {
    p.note(summary, "Summary");
  }

  if (options.dryRun) {
    generateProject(answers, { dryRun: true });
    p.log.info(`Dry run — would write to ${answers.targetDirectory}`);
    p.outro("No files written.");
    return;
  }

  const spinner = p.spinner();
  spinner.start("Generating project");
  const plan = generateProject(answers);
  spinner.stop("Project generated");

  p.note(
    [
      plan.targetDirectory,
      `  ${plan.names.appDir}/`,
      `  ${plan.names.rootDir}/`,
      `  ${plan.names.vaultDir}/`,
      "  docs/costs.md",
      "  bootstrap-init.answers.json",
      "",
      "Deploy order: vault → root project → app.",
    ].join("\n"),
    "Created",
  );
  p.outro("Done.");
}

async function main(): Promise<void> {
  try {
    await runCli();
  } catch (error) {
    if (error instanceof UserCancelledError) {
      p.cancel("Cancelled.");
      process.exit(1);
    }
    p.log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

void main();
