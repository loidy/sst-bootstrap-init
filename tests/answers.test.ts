import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAnswers, quickPreset } from "../scripts/answers.ts";

test("quick preset parses", () => {
  const answers = quickPreset({
    projectName: "acme",
    displayName: "Acme",
    targetDirectory: "/tmp/acme",
    rootDomain: "acme.example",
  });
  assert.equal(parseAnswers(answers).projectName, "acme");
});

test("rejects proxy with min 0 ACU", () => {
  const answers = quickPreset({
    projectName: "acme",
    displayName: "Acme",
    targetDirectory: "/tmp/acme",
  });
  answers.stages[0]!.proxy = true;
  answers.stages[0]!.scalingMinAcu = 0;
  assert.throws(() => parseAnswers(answers));
});

test("rejects duplicate stage names", () => {
  const answers = quickPreset({
    projectName: "acme",
    displayName: "Acme",
    targetDirectory: "/tmp/acme",
  });
  answers.stages[1]!.name = "dev";
  assert.throws(() => parseAnswers(answers));
});
