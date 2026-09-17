import { cpSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const IGNORE_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  ".swc",
  ".sst",
  ".git",
  "coverage",
  "generated",
]);

const IGNORE_FILE_NAMES = new Set([
  "package-lock.json",
  "tsconfig.tsbuildinfo",
  "next-env.d.ts",
]);

function shouldIgnore(path: string, root: string): boolean {
  const rel = relative(root, path);
  if (!rel || rel === ".") {
    return false;
  }
  const parts = rel.split(/[\\/]/);
  for (const part of parts) {
    if (IGNORE_DIR_NAMES.has(part)) {
      return true;
    }
  }
  return IGNORE_FILE_NAMES.has(basename(path));
}

export function copyTemplate(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (source) => !shouldIgnore(source, src),
  });
}

export function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (IGNORE_DIR_NAMES.has(entry)) {
        continue;
      }
      out.push(...listFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out;
}
