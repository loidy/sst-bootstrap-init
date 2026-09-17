import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyReplacements,
  identityReplacements,
  REGION_END,
  REGION_START,
  replaceGeneratedRegion,
} from "../scripts/generate/replace.ts";

test("replaces bootstrap-app before bootstrap", () => {
  const pairs = identityReplacements({
    slug: "acme",
    displayName: "Acme",
    rootDomain: "acme.example",
  });
  const source = [
    'name: "bootstrap-app"',
    'name: "bootstrap-root-project"',
    'name: "bootstrap-vault"',
    'scope: "@bootstrap/database"',
    "title: Bootstrap App",
    "prefix: bootstrap-files",
    "db: bootstrap-db",
    "domain: bootstrap.example",
  ].join("\n");

  const result = applyReplacements(source, pairs);
  assert.equal(
    result,
    [
      'name: "acme-app"',
      'name: "acme-root-project"',
      'name: "acme-vault"',
      'scope: "@acme/database"',
      "title: Acme",
      "prefix: acme-files",
      "db: acme-db",
      "domain: acme.example",
    ].join("\n"),
  );
});

test("does not rewrite generated-region markers or the tool name", () => {
  const pairs = identityReplacements({
    slug: "acme",
    displayName: "Acme",
    rootDomain: "acme.example",
  });
  const source = `${REGION_START}\nconst APP_PREFIX = "bootstrap";\n${REGION_END}\nre-run bootstrap-init`;
  const result = applyReplacements(source, pairs);
  assert.match(result, new RegExp(REGION_START));
  assert.match(result, new RegExp(REGION_END));
  assert.match(result, /const APP_PREFIX = "acme"/);
  assert.match(result, /re-run bootstrap-init/);
});

test("replaceGeneratedRegion swaps only the delimited body", () => {
  const source = `header\n${REGION_START} — old\nconst APP_PREFIX = "bootstrap";\n${REGION_END}\nfooter\n`;
  const result = replaceGeneratedRegion(source, 'const APP_PREFIX = "acme";');
  assert.equal(
    result,
    `header\n${REGION_START} — re-run bootstrap-init to regenerate, or edit by hand\nconst APP_PREFIX = "acme";\n${REGION_END}\nfooter\n`,
  );
});
