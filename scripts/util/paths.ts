import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function templatesRoot(from = import.meta.dirname): string {
  return resolve(from, "../..");
}

export function templateDir(name: "app" | "root" | "vault"): string {
  const root = templatesRoot();
  switch (name) {
    case "app":
      return resolve(root, "bootstrap-app");
    case "root":
      return resolve(root, "bootstrap-root-project");
    case "vault":
      return resolve(root, "bootstrap-vault");
  }
}

export function assertTemplatesExist(): void {
  for (const name of ["app", "root", "vault"] as const) {
    const dir = templateDir(name);
    if (!existsSync(dir)) {
      throw new Error(`Template missing: ${dir}`);
    }
  }
}
