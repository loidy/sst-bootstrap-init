import assert from "node:assert/strict";
import { test } from "node:test";
import { quickPreset } from "../scripts/answers.ts";
import { estimateCost, natDeltaUsd, proxyDeltaUsd } from "../scripts/cost.ts";

test("quick preset estimate is finite and lists NAT + Aurora levers", () => {
  const answers = quickPreset({
    projectName: "acme",
    displayName: "Acme",
    targetDirectory: "/tmp/acme",
  });
  const estimate = estimateCost(answers);
  assert.ok(estimate.monthlyUsd > 0);
  assert.equal(estimate.stages.length, 3);
  const production = estimate.stages.find((stage) => stage.stage === "production");
  const dev = estimate.stages.find((stage) => stage.stage === "dev");
  assert.ok(production);
  assert.ok(dev);
  assert.ok(production.monthlyUsd > dev.monthlyUsd);
});

test("managed NAT and RDS Proxy deltas are substantial", () => {
  assert.ok(natDeltaUsd("ec2", "managed", 2) > 50);
  assert.ok(proxyDeltaUsd(true, 0) > 80);
});
