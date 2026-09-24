// Session start step: where the Harness config switches the Status line on, point Claude Code's
// status line at the plugin's script, in the project's .claude/settings.local.json (ADR 0009).
// It writes and removes only a status line marked as its own, rewriting it each session since
// the script's path changes with every plugin version.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

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

// Brings the project's status line in line with `want`, whether the Harness config switches it
// on; without it, leaves it as it is. Returns what Claude should be told.
export function sync(dir: string, want?: boolean, script = SCRIPT): string[] {
  if (want === undefined) return [];
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
