import assert from "node:assert/strict";
import { test } from "node:test";
import { quickPreset } from "../scripts/answers.ts";
import { buildPlan, deployTriggerFor, fallbackStageName } from "../scripts/plan.ts";

test("quick preset plan uses expected identities and stages", () => {
  const answers = quickPreset({
    projectName: "acme",
    displayName: "Acme",
    targetDirectory: "/tmp/acme",
    rootDomain: "acme.example",
  });
  const plan = buildPlan(answers);

  assert.equal(plan.names.appDir, "acme-app");
  assert.equal(plan.names.rootDir, "acme-root-project");
  assert.equal(plan.names.vaultDir, "acme-vault");
  assert.equal(plan.names.databasePackageScope, "@acme/database");
  assert.deepEqual(
    plan.stages.map((stage) => stage.name),
    ["dev", "staging", "production"],
  );
  assert.equal(plan.fallbackStageName, "dev");
  assert.equal(plan.stages[0]?.githubEnvironment, "development");
  assert.equal(plan.stages[0]?.deployTrigger.kind, "push-main");
  assert.equal(plan.stages[2]?.deployTrigger.kind, "push-tags");
});

test("unknown custom stages inherit a non-production fallback", () => {
  const answers = quickPreset({
    projectName: "acme",
    displayName: "Acme",
    targetDirectory: "/tmp/acme",
  });
  answers.stages = [
    { ...answers.stages[2]!, name: "live", productionLevel: true },
    { ...answers.stages[0]!, name: "sandbox", productionLevel: false },
  ];
  assert.equal(fallbackStageName(answers.stages), "sandbox");
  const trigger = deployTriggerFor(answers.stages[0]!, answers.stages);
  assert.equal(trigger.kind, "push-tags");
});
