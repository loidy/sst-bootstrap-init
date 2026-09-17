import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { quickPreset } from "../scripts/answers.ts";
import { generateProject } from "../scripts/generate/index.ts";
import { REGION_START } from "../scripts/generate/replace.ts";

const tmp = mkdtempSync(join(tmpdir(), "bootstrap-init-"));
after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test("generateProject writes a working app", { timeout: 600_000 }, () => {
  const answers = quickPreset({
    projectName: "northwind",
    displayName: "Northwind",
    targetDirectory: tmp,
    rootDomain: "northwind.example",
  });
  answers.gitInit = false;
  answers.npmInstall = false;

  generateProject(answers);

  const appConfig = readFileSync(join(tmp, "northwind-app", "sst.config.ts"), "utf8");
  assert.match(appConfig, new RegExp(REGION_START));
  assert.match(appConfig, /const APP_PREFIX = "northwind"/);
  assert.doesNotMatch(appConfig, /bootstrap-app/);

  const rootConfig = readFileSync(
    join(tmp, "northwind-root-project", "sst.config.ts"),
    "utf8",
  );
  assert.match(rootConfig, /kind: "aurora-serverless-v2"/);
  assert.match(rootConfig, /prefix: "northwind-files"/);

  const vaultPull = readFileSync(
    join(tmp, "northwind-vault", "scripts", "env-pull.ts"),
    "utf8",
  );
  assert.match(vaultPull, /const APP_PREFIX = "northwind"/);
  assert.doesNotMatch(vaultPull, /\/bootstrap\//);

  const answersFile = JSON.parse(
    readFileSync(join(tmp, "bootstrap-init.answers.json"), "utf8"),
  ) as { projectName: string };
  assert.equal(answersFile.projectName, "northwind");

  const pkg = JSON.parse(
    readFileSync(join(tmp, "northwind-app", "package.json"), "utf8"),
  ) as { name: string; dependencies: Record<string, string> };
  assert.equal(pkg.name, "northwind-app");
  assert.equal(pkg.dependencies["@northwind/database"], "^1.0.0");

  const appDir = join(tmp, "northwind-app");
  const install = spawnSync("npm", ["install"], {
    cwd: appDir,
    encoding: "utf8",
    timeout: 180_000,
  });
  assert.equal(install.status, 0, install.stderr || install.stdout);

  for (const script of ["lint", "typecheck", "test", "build"] as const) {
    const result = spawnSync("npm", ["run", script], {
      cwd: appDir,
      encoding: "utf8",
      timeout: 180_000,
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci",
        NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      },
    });
    assert.equal(
      result.status,
      0,
      `${script} failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
});
