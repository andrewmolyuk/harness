// SessionStart hook: in a project with .harness.json, generate the Git hooks its `gitHooks`
// lists into the repo's hooks folder and copy the Built-in checks beside them (ADR 0007).
// It writes and removes only hooks marked as its own; problems are reported to Claude, and
// anything missing (git, a repo, the config) means it quietly does nothing.
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
import { load } from "../lib/config";

type Input = { cwd?: string };
type GitHook = (typeof GIT_HOOKS)[number];

export const GIT_HOOKS = ["pre-commit", "commit-msg", "pre-push"] as const;
export const BUILTINS: Record<string, GitHook> = {
  "adr-immutable": "pre-commit",
  "no-secrets": "pre-commit",
  "conventional-commits": "commit-msg",
  "no-ai-coauthor": "commit-msg",
  "linear-history": "pre-push",
};
const MARKER = "# managed by am";
const CHECKS = join(import.meta.dir, "..", "githooks");

// The entries per Git hook, or what's wrong with `gitHooks`.
export function parse(gitHooks: unknown): { hooks: Map<GitHook, string[]>; errors: string[] } {
  const hooks = new Map<GitHook, string[]>();
  const errors: string[] = [];
  if (gitHooks === undefined) return { hooks, errors };
  if (!gitHooks || typeof gitHooks !== "object" || Array.isArray(gitHooks))
    return { hooks, errors: ["gitHooks is not an object"] };
  for (const [hook, entries] of Object.entries(gitHooks)) {
    if (!GIT_HOOKS.includes(hook as GitHook)) {
      errors.push(`${hook} is not a supported Git hook (${GIT_HOOKS.join(", ")})`);
    } else if (!Array.isArray(entries) || !entries.every((e) => typeof e === "string" && e)) {
      errors.push(`${hook} is not a list of commands`);
    } else {
      for (const e of entries as string[]) {
        const owner = e.startsWith("am:") ? BUILTINS[e.slice(3)] : hook;
        if (!owner) errors.push(`${e} is not a Built-in check`);
        else if (owner !== hook) errors.push(`${e} belongs to ${owner}, not ${hook}`);
      }
      hooks.set(hook as GitHook, entries as string[]);
    }
  }
  return { hooks, errors };
}

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

// Brings the repo's Git hooks in line with the config; returns what Claude should be told.
export function sync(dir: string): string[] {
  let config;
  try {
    config = load(dir);
  } catch (e) {
    return [`${(e as Error).message}; Git hooks left as they are`];
  }
  if (!config) return [];
  const { hooks, errors } = parse(config.gitHooks);
  if (errors.length)
    return [...errors.map((e) => `.harness.json: ${e}`), "Git hooks left as they are"];
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

async function main() {
  const { cwd } = (await Bun.stdin.json()) as Input;
  const project = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const report = project ? sync(project) : [];
  if (report.length) console.log(`am Git hooks:\n${report.join("\n")}`);
}

if (import.meta.main) main().catch(() => {});
