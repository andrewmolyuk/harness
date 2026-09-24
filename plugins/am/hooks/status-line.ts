// SessionStart hook: in a project whose .harness.json has `"statusLine": true`, point Claude
// Code's status line at the plugin's script, in the project's .claude/settings.local.json
// (ADR 0008). It writes and removes only a status line marked as its own, rewriting it each
// session since the script's path changes with every plugin version; problems are reported to
// Claude, and anything missing (the config, the `statusLine` key) means it quietly does nothing.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { load } from "../lib/config";

type Input = { cwd?: string };

const MARKER = "# managed by am";
const SCRIPT = join(import.meta.dir, "..", "statusline", "statusline.ts");
export const SETTINGS = join(".claude", "settings.local.json");

export function command(script: string): string {
  return `bun '${script.replaceAll("'", `'\\''`)}' ${MARKER}`;
}

function git(dir: string, ...args: string[]) {
  return spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
}

// Keeps git from listing a settings file it doesn't already ignore.
function ignore(dir: string) {
  if (git(dir, "check-ignore", "-q", SETTINGS).status !== 1) return;
  const exclude = git(dir, "rev-parse", "--git-path", "info/exclude");
  if (exclude.status !== 0) return;
  const file = resolve(dir, exclude.stdout.trim());
  mkdirSync(resolve(file, ".."), { recursive: true });
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  appendFileSync(file, `${current && !current.endsWith("\n") ? "\n" : ""}/${SETTINGS}\n`);
}

// Brings the project's status line in line with the config; returns what Claude should be told.
export function sync(dir: string, script = SCRIPT): string[] {
  let config;
  try {
    config = load(dir);
  } catch (e) {
    return [`${(e as Error).message}; status line left as it is`];
  }
  if (!config) return [];
  const want = config.statusLine ?? false;
  if (typeof want !== "boolean") return [".harness.json: statusLine is not true or false"];
  const file = join(dir, SETTINGS);
  let settings: Record<string, unknown> = {};
  if (existsSync(file)) {
    try {
      settings = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return [`${SETTINGS} is not valid JSON; status line left as it is`];
    }
  } else if (!want) return [];
  const current = settings.statusLine as { command?: unknown } | undefined;
  const ours = typeof current?.command === "string" && current.command.endsWith(MARKER);
  if (current && !ours)
    return want ? [`statusLine: left alone, one in ${SETTINGS} the am plugin didn't write`] : [];
  if (want) {
    const line = { type: "command", command: command(script), padding: 0 };
    if (JSON.stringify(current) === JSON.stringify(line)) return [];
    settings.statusLine = line;
  } else if (ours) {
    delete settings.statusLine;
  } else return [];
  const created = !existsSync(file);
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  if (created) ignore(dir);
  return [];
}

async function main() {
  const { cwd } = (await Bun.stdin.json()) as Input;
  const dir = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const report = dir ? sync(dir) : [];
  if (report.length) console.log(`am status line:\n${report.join("\n")}`);
}

if (import.meta.main) main().catch(() => {});
