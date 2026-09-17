import { spawnSync } from "node:child_process";

export function gitInit(dir: string): void {
  const result = spawnSync("git", ["init"], { cwd: dir, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git init failed in ${dir}: ${result.stderr || result.stdout}`);
  }
}

export function npmInstall(dir: string): void {
  const result = spawnSync("npm", ["install"], {
    cwd: dir,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`npm install failed in ${dir}`);
  }
}
