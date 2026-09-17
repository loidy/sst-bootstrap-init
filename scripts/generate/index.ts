import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Answers } from "../answers.ts";
import { formatCostMarkdown, estimateCost } from "../cost.ts";
import { buildPlan, type ProjectPlan } from "../plan.ts";
import { templateDir } from "../util/paths.ts";
import { copyTemplate, listFilesRecursive } from "./copy.ts";
import {
  emitAppGenerated,
  emitRootGenerated,
  emitVaultGenerated,
} from "./emit-config.ts";
import { gitInit, npmInstall } from "./git.ts";
import {
  applyReplacements,
  identityReplacements,
  isTextFile,
  replaceGeneratedRegion,
} from "./replace.ts";
import {
  appCiWorkflow,
  emitAppDeployWorkflow,
  emitAppReviewWorkflow,
  emitRemoveReviewWorkflow,
  emitRootDeployWorkflow,
  emitRootReviewWorkflow,
  emitVaultDeployWorkflow,
  emitVaultReviewWorkflow,
  vaultCiWorkflow,
  workflowFilename,
} from "./workflows.ts";

export type GenerateOptions = {
  dryRun?: boolean;
};

function rewriteTree(dir: string, pairs: Array<[string, string]>): void {
  for (const file of listFilesRecursive(dir)) {
    if (!isTextFile(basename(file))) {
      continue;
    }
    const original = readFileSync(file, "utf8");
    const next = applyReplacements(original, pairs);
    if (next !== original) {
      writeFileSync(file, next);
    }
  }
}

function writeGeneratedRegion(file: string, body: string): void {
  const original = readFileSync(file, "utf8");
  writeFileSync(file, replaceGeneratedRegion(original, body));
}

function writeWorkflows(dir: string, files: Record<string, string>): void {
  const workflowDir = join(dir, ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(workflowDir, name), contents);
  }
}

function clearGeneratedDeployWorkflows(dir: string): void {
  const workflowDir = join(dir, ".github", "workflows");
  let entries: string[] = [];
  try {
    entries = readdirSync(workflowDir);
  } catch {
    return;
  }
  for (const file of entries) {
    if (
      file.startsWith("deploy-") ||
      file === "remove-review.yml"
    ) {
      rmSync(join(workflowDir, file), { force: true });
    }
  }
}

export function generateProject(answers: Answers, options: GenerateOptions = {}): ProjectPlan {
  const plan = buildPlan(answers);
  if (options.dryRun) {
    return plan;
  }

  mkdirSync(plan.targetDirectory, { recursive: true });
  const appDest = join(plan.targetDirectory, plan.names.appDir);
  const rootDest = join(plan.targetDirectory, plan.names.rootDir);
  const vaultDest = join(plan.targetDirectory, plan.names.vaultDir);

  copyTemplate(templateDir("app"), appDest);
  copyTemplate(templateDir("root"), rootDest);
  copyTemplate(templateDir("vault"), vaultDest);

  const pairs = identityReplacements({
    slug: plan.names.slug,
    displayName: plan.names.displayName,
    rootDomain: plan.rootDomain,
  });

  rewriteTree(appDest, pairs);
  rewriteTree(rootDest, pairs);
  rewriteTree(vaultDest, pairs);

  writeGeneratedRegion(join(appDest, "sst.config.ts"), emitAppGenerated(answers));
  writeGeneratedRegion(join(rootDest, "sst.config.ts"), emitRootGenerated(answers));
  writeGeneratedRegion(join(vaultDest, "sst.config.ts"), emitVaultGenerated(answers));

  if (plan.generateWorkflows) {
    clearGeneratedDeployWorkflows(appDest);
    clearGeneratedDeployWorkflows(rootDest);
    clearGeneratedDeployWorkflows(vaultDest);

    const appFiles: Record<string, string> = {
      "ci.yml": appCiWorkflow(),
    };
    const rootFiles: Record<string, string> = {};
    const vaultFiles: Record<string, string> = {
      "ci.yml": vaultCiWorkflow(),
    };

    for (const stage of plan.stages) {
      const name = workflowFilename(stage);
      appFiles[name] = emitAppDeployWorkflow(plan, stage);
      rootFiles[name] = emitRootDeployWorkflow(plan, stage);
      vaultFiles[name] = emitVaultDeployWorkflow(plan, stage);
    }

    if (plan.reviewStages) {
      appFiles["deploy-review.yml"] = emitAppReviewWorkflow(plan);
      appFiles["remove-review.yml"] = emitRemoveReviewWorkflow(plan, "");
      rootFiles["deploy-review.yml"] = emitRootReviewWorkflow(plan);
      rootFiles["remove-review.yml"] = emitRemoveReviewWorkflow(
        plan,
        `          ROOT_DOMAIN: \${{ vars.ROOT_DOMAIN }}`,
      );
      vaultFiles["deploy-review.yml"] = emitVaultReviewWorkflow(plan);
      vaultFiles["remove-review.yml"] = emitRemoveReviewWorkflow(
        plan,
        [
          `          ROOT_DOMAIN: \${{ vars.ROOT_DOMAIN }}`,
          ...plan.secrets.map(
            (secret) => `          ${secret.key}: \${{ secrets.${secret.key} }}`,
          ),
        ].join("\n"),
      );
    }

    writeWorkflows(appDest, appFiles);
    writeWorkflows(rootDest, rootFiles);
    writeWorkflows(vaultDest, vaultFiles);
  }

  const estimate = estimateCost(answers);
  const costs = formatCostMarkdown(answers, estimate);
  mkdirSync(join(plan.targetDirectory, "docs"), { recursive: true });
  writeFileSync(join(plan.targetDirectory, "docs", "costs.md"), costs);
  mkdirSync(join(rootDest, "docs"), { recursive: true });
  writeFileSync(join(rootDest, "docs", "costs.md"), costs);

  writeFileSync(
    join(plan.targetDirectory, "bootstrap-init.answers.json"),
    `${JSON.stringify(answers, null, 2)}\n`,
  );

  writeFileSync(
    join(plan.targetDirectory, "README.md"),
    `# ${plan.names.displayName}

Generated by bootstrap-init.

| Repository | Responsibility |
| --- | --- |
| \`${plan.names.appDir}\` | Next.js application |
| \`${plan.names.rootDir}\` | VPC, database, S3, KMS |
| \`${plan.names.vaultDir}\` | Stage-scoped SSM config and secrets |

Deploy order for a new stage: vault, then root project, then app.

See \`docs/costs.md\` for the cost estimate captured at generation time.
`,
  );

  if (plan.gitInit) {
    gitInit(appDest);
    gitInit(rootDest);
    gitInit(vaultDest);
  }

  if (plan.npmInstall) {
    npmInstall(appDest);
    npmInstall(rootDest);
    npmInstall(vaultDest);
  }

  return plan;
}
