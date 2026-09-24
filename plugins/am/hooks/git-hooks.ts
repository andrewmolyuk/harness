// Session start step: generate the Git hooks the Harness config's `gitHooks` lists into the
// repo's hooks folder and copy the Built-in checks beside them (ADR 0007). It writes and
// removes only hooks marked as its own; anything missing (git, a repo) means it does nothing.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { BUILTINS, GIT_HOOKS, type GitHook } from "../lib/config";

const MARKER = "# managed by am";
const CHECKS = join(import.meta.dir, "..", "githooks");

const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

// A Git hook that runs its entries in order and stops at the first failure. Each gets the
// hook's arguments, and pre-push's stdin.
export function script(hook: GitHook, entries: string[]): string {
  const stdin = hook === "pre-push";
  return [
    "#!/bin/sh",
    `${MARKER}: generated from .harness.json by the am plugin; edits are overwritten.`,
    'am="$(dirname "$0")/am"',
    "check() {",
    "  if command -v bun >/dev/null 2>&1; then",
    '    name=$1; shift; bun "$am/$name.ts" "$@"',
    "  else",
    '    echo "am: bun not found, skipped am:$1" >&2',
    "  fi",
    "}",
    ...(stdin ? ["input=$(cat)"] : []),
    ...entries.map((e) => {
      const run = e.startsWith("am:")
        ? `check ${e.slice(3)} "$@"`
        : `sh -c ${quote(e)} ${hook} "$@"`;
      return `${stdin ? `printf '%s\\n' "$input" | ` : ""}${run} || exit 1`;
    }),
    "",
  ].join("\n");
}

function git(dir: string, ...args: string[]) {
  return spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
}

// Brings the repo's Git hooks in line with `hooks`, the Harness config's `gitHooks`; without it,
// leaves them as they are. Returns what Claude should be told.
export function sync(dir: string, hooks?: Map<GitHook, string[]>): string[] {
  if (!hooks) return [];
  const path = git(dir, "rev-parse", "--git-path", "hooks");
  if (path.status !== 0) return [];
  const folder = resolve(dir, path.stdout.trim());
  const report: string[] = [];
  for (const hook of GIT_HOOKS) {
    const file = join(folder, hook);
    const entries = hooks.get(hook);
    const current = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (current !== null && !current.includes(MARKER)) {
      if (entries)
        report.push(`${hook}: left alone, an existing Git hook the am plugin didn't write`);
    } else if (entries) {
      mkdirSync(folder, { recursive: true });
      writeFileSync(file, script(hook, entries));
      chmodSync(file, 0o755);
    } else if (current !== null) {
      unlinkSync(file);
    }
  }
  if (hooks.size) {
    mkdirSync(join(folder, "am"), { recursive: true });
    for (const name of Object.keys(BUILTINS))
      copyFileSync(join(CHECKS, `${name}.ts`), join(folder, "am", `${name}.ts`));
  }
  const linear = [...hooks.values()].some((e) => e.includes("am:linear-history"));
  if (linear && git(dir, "config", "--local", "pull.rebase").status !== 0)
    git(dir, "config", "--local", "pull.rebase", "true");
  return report;
}
