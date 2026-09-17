export const REGION_START = "// #region bootstrap-init:generated";
export const REGION_END = "// #endregion bootstrap-init:generated";

const PROTECTED = [
  [REGION_START, "__BOOTSTRAP_INIT_REGION_START__"],
  [REGION_END, "__BOOTSTRAP_INIT_REGION_END__"],
  ["bootstrap-init", "__BOOTSTRAP_INIT_NAME__"],
] as const;

export function identityReplacements(input: {
  slug: string;
  displayName: string;
  rootDomain: string;
}): Array<[string, string]> {
  const { slug, displayName, rootDomain } = input;
  return [
    ["@bootstrap/", `@${slug}/`],
    ["bootstrap-root-project", `${slug}-root-project`],
    ["bootstrap-vault", `${slug}-vault`],
    ["bootstrap-app", `${slug}-app`],
    ["bootstrap-files", `${slug}-files`],
    ["bootstrap-local-pg", `${slug}-local-pg`],
    ["bootstrap-db", `${slug}-db`],
    ["Bootstrap App", displayName],
    ["bootstrap.example", rootDomain],
    ["bootstrap", slug],
  ];
}

export function applyReplacements(
  content: string,
  pairs: ReadonlyArray<readonly [string, string]>,
): string {
  let result = content;
  for (const [from, placeholder] of PROTECTED) {
    result = result.split(from).join(placeholder);
  }
  for (const [from, to] of pairs) {
    result = result.split(from).join(to);
  }
  for (const [from, placeholder] of PROTECTED) {
    result = result.split(placeholder).join(from);
  }
  return result;
}

export function replaceGeneratedRegion(source: string, body: string): string {
  const start = source.indexOf(REGION_START);
  if (start < 0) {
    throw new Error(`Missing ${REGION_START}`);
  }
  const end = source.indexOf(REGION_END, start);
  if (end < 0) {
    throw new Error(`Missing ${REGION_END}`);
  }
  return (
    source.slice(0, start) +
    REGION_START +
    " — re-run bootstrap-init to regenerate, or edit by hand\n" +
    body.trimEnd() +
    "\n" +
    REGION_END +
    source.slice(end + REGION_END.length)
  );
}

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".toml",
  ".prisma",
  ".sql",
  ".css",
  ".html",
  ".txt",
  ".example",
  ".gitignore",
  ".prettierignore",
  ".prettierrc",
  ".sh",
  ".pem",
]);

const TEXT_FILENAMES = new Set([
  ".gitignore",
  ".prettierignore",
  ".prettierrc",
  ".env.example",
  "Dockerfile",
  "LICENSE",
]);

export function isTextFile(filename: string): boolean {
  if (TEXT_FILENAMES.has(filename)) {
    return true;
  }
  const dot = filename.lastIndexOf(".");
  if (dot < 0) {
    return false;
  }
  return TEXT_EXTENSIONS.has(filename.slice(dot));
}
