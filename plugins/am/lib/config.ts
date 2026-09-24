// The repo's Harness config, .harness.json (ADR 0004, 0007, 0009, 0011); harness.schema.json
// at the plugin root describes it. One per repo, at its root beside .about/ (ADR 0018).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Config = Record<string, unknown>;

// The root of the git repo `dir` is in, or null outside one.
export function repoRoot(dir: string): string | null {
  const top = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return top.status === 0 ? top.stdout.trim() : null;
}

// The parsed config at the repo root, or in `dir` outside a repo; null when there is none.
// Throws when it isn't a JSON object.
export function load(dir: string): Config | null {
  const file = join(repoRoot(dir) ?? dir, ".harness.json");
  if (!existsSync(file)) return null;
  const config: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (!config || typeof config !== "object" || Array.isArray(config))
    throw new Error(".harness.json is not a JSON object");
  return config as Config;
}
