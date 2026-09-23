// Built-in check am:adr-immutable (pre-commit): an ADR committed as accepted or superseded is
// not edited, renamed or deleted; superseding an accepted one changes only its Status (to
// `superseded by <number>`, an ADR that exists) and Date. Copied into a project's hooks folder,
// so it imports nothing from the plugin.
import { spawnSync } from "node:child_process";

const FOLDER = ".about/adr/";
const STATUS = /^Status:\s*(.*)$/m;
const LOCKED = /^(accepted|superseded)\b/i;
const SUPERSEDED = /^superseded by (\d+)$/i;

function git(cwd: string | undefined, ...args: string[]): string | null {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

const status = (text: string) => STATUS.exec(text)?.[1]?.trim() ?? "";
const rest = (text: string) =>
  text.split("\n").filter((l) => !/^(Status|Date):/.test(l)).join("\n");

// The staged changes to locked ADRs, each as `<path>: <what's wrong>`.
export function violations(cwd?: string): string[] {
  if (git(cwd, "rev-parse", "--verify", "-q", "HEAD") === null) return []; // no commits yet
  const staged = git(cwd, "diff", "--cached", "--name-status", "--no-renames", "--", FOLDER);
  const adrs = git(cwd, "ls-files", "--", FOLDER)?.split("\n") ?? [];
  const found: string[] = [];
  for (const line of staged?.split("\n") ?? []) {
    const [change, path] = line.split("\t");
    if (!path || (change !== "M" && change !== "D")) continue;
    const before = git(cwd, "show", `HEAD:${path}`);
    if (before === null || !LOCKED.test(status(before))) continue;
    const was = status(before).toLowerCase().startsWith("accepted") ? "accepted" : "superseded";
    if (change === "D") {
      found.push(`${path}: ${was}, can't be deleted or renamed`);
      continue;
    }
    const after = git(cwd, "show", `:${path}`) ?? "";
    const by = SUPERSEDED.exec(status(after))?.[1];
    if (was !== "accepted" || !by || rest(after) !== rest(before))
      found.push(`${path}: ${was}, only its Status and Date may change, to supersede it`);
    else if (!adrs.some((a) => a.startsWith(`${FOLDER}${by}-`)))
      found.push(`${path}: superseded by ${by}, but there is no ADR ${by}`);
  }
  return found;
}

if (import.meta.main) {
  const found = violations();
  if (found.length) {
    console.error(
      "am:adr-immutable: a committed accepted ADR is immutable; write a new ADR that " +
        `supersedes it:\n${found.join("\n")}`,
    );
    process.exit(1);
  }
}
