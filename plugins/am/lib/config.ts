// The repo's Harness config, .harness.json (ADR 0004, 0007, 0009, 0011), read and checked in one
// place: every key's rules and defaults, and what's wrong with it. harness.schema.json at the
// plugin root describes it. One per repo, at its root beside .about/ (ADR 0018).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type GitHook = (typeof GIT_HOOKS)[number];
export type Block = { pattern: RegExp; reason: string };
export type BarThresholds = { yellow: number; red: number };
export type Thresholds = {
  context: BarThresholds;
  fiveHour: BarThresholds;
  sevenDay: BarThresholds;
};
export type Config = {
  root: string; // where .harness.json and .about/ sit
  guard: Block[]; // the Guard's extra blocks, the valid ones
  gitHooks?: Map<GitHook, string[]>; // absent: leave the Git hooks as they are
  statusLine?: Thresholds | false; // absent: leave the Status line as it is
  guidelines: boolean;
  sessionReview: boolean;
  problems: string[]; // one line each, for Claude
};

export const GIT_HOOKS = ["pre-commit", "commit-msg", "pre-push"] as const;
export const BUILTINS: Record<string, GitHook> = {
  "adr-immutable": "pre-commit",
  "no-secrets": "pre-commit",
  "conventional-commits": "commit-msg",
  "no-ai-coauthor": "commit-msg",
  "linear-history": "pre-push",
};
export const THRESHOLDS: Thresholds = {
  context: { yellow: 15, red: 20 },
  fiveHour: { yellow: 70, red: 85 },
  sevenDay: { yellow: 80, red: 95 },
};
export const SCHEMA =
  "https://raw.githubusercontent.com/andrewmolyuk/harness/main/plugins/am/harness.schema.json";
// What the plugin writes into a new config (ADR 0016): each value keeps its hook doing what it
// does without the key. `sessionReview` is left out: without it the Session review runs where
// .about/ exists, which false would stop.
export const WRITTEN: Record<string, unknown> = {
  $schema: SCHEMA,
  guard: { block: [] },
  statusLine: false,
  gitHooks: {},
  guidelines: false,
};
const KEYS = new Set([...Object.keys(WRITTEN), "sessionReview"]);

// The root of the git repo `dir` is in, or null outside one.
export function repoRoot(dir: string): string | null {
  const top = spawnSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return top.status === 0 ? top.stdout.trim() : null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

// The Harness config at the repo root, or in `dir` outside a repo. A wrong key is reported and
// falls back as each hook would without it; a missing or unreadable file leaves the Git hooks
// and the Status line as they are.
export function readConfig(dir: string): Config {
  const root = repoRoot(dir) ?? dir;
  const about = existsSync(join(root, ".about"));
  const none: Config = { root, guard: [], guidelines: false, sessionReview: about, problems: [] };
  const file = join(root, ".harness.json");
  if (!existsSync(file)) return none;
  let config: unknown;
  try {
    config = JSON.parse(readFileSync(file, "utf8"));
  } catch {}
  if (!isObject(config))
    return { ...none, problems: [".harness.json isn't a JSON object; none of it applies"] };
  const problems: string[] = [];
  for (const key of Object.keys(config))
    if (!KEYS.has(key)) problems.push(`${key} is not a setting; ignored`);
  const found: Config = {
    root,
    guard: guard(config.guard, problems),
    guidelines: flag(config, "guidelines", false, problems),
    sessionReview: flag(config, "sessionReview", about, problems),
    problems,
  };
  const hooks = gitHooks(config.gitHooks, problems);
  if (hooks) found.gitHooks = hooks;
  const line = statusLine(config.statusLine, problems);
  if (line !== undefined) found.statusLine = line;
  found.problems = problems.map((p) => `.harness.json: ${p}`);
  return found;
}

function flag(
  config: Record<string, unknown>,
  key: string,
  fallback: boolean,
  problems: string[],
): boolean {
  const value = config[key];
  if (value === undefined || typeof value === "boolean") return value ?? fallback;
  problems.push(`${key} is not a boolean`);
  return fallback;
}

// `{ "block": [{ "pattern", "reason" }] }`, each pattern a regex on the command text.
function guard(value: unknown, problems: string[]): Block[] {
  if (value === undefined) return [];
  const list = isObject(value) ? (value.block ?? []) : null;
  if (!Array.isArray(list)) {
    problems.push("guard is not { block: [{ pattern, reason }] }; no extra blocks");
    return [];
  }
  return list.flatMap((b: { pattern?: unknown; reason?: unknown } | null, i) => {
    const where = `guard.block[${i}]`;
    if (typeof b?.pattern !== "string" || typeof b.reason !== "string") {
      problems.push(`${where} needs a pattern and a reason; ignored`);
      return [];
    }
    try {
      return [{ pattern: new RegExp(b.pattern), reason: b.reason }];
    } catch {
      problems.push(`${where}.pattern is not a regular expression; ignored`);
      return [];
    }
  });
}

// The entries per Git hook; a Built-in check only under its own Git hook.
function gitHooks(value: unknown, problems: string[]): Map<GitHook, string[]> | undefined {
  const hooks = new Map<GitHook, string[]>();
  if (value === undefined) return hooks;
  const errors: string[] = [];
  if (!isObject(value)) errors.push("gitHooks is not an object");
  else
    for (const [hook, entries] of Object.entries(value)) {
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
  problems.push(...errors.map((e) => `${e}; Git hooks left as they are`));
  return errors.length ? undefined : hooks;
}

// `true`, `false`, or the percentages at which each bar turns yellow and red over the defaults.
function statusLine(value: unknown, problems: string[]): Thresholds | false | undefined {
  if (value === undefined || value === false) return false;
  const set = structuredClone(THRESHOLDS);
  if (value === true) return set;
  if (!isObject(value)) {
    problems.push("statusLine is not true, false or an object of thresholds");
    return undefined;
  }
  const percent = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 100;
  for (const [key, bar] of Object.entries(value)) {
    const where = `statusLine.${key}`;
    if (!(key in set)) {
      problems.push(`${where} is not a bar (${Object.keys(set).join(", ")}); ignored`);
      continue;
    }
    if (!isObject(bar)) {
      problems.push(`${where} is not an object of yellow and red; the defaults are used`);
      continue;
    }
    const t = { ...set[key as keyof Thresholds] };
    for (const [color, pct] of Object.entries(bar)) {
      if (color !== "yellow" && color !== "red")
        problems.push(`${where}.${color} is not yellow or red; ignored`);
      else if (!percent(pct))
        problems.push(`${where}.${color} is not a percentage from 0 to 100; the default is used`);
      else t[color] = pct;
    }
    const { yellow, red } = t;
    if (yellow > red)
      problems.push(`${where}: yellow (${yellow}) is above red (${red}); the defaults are used`);
    else set[key as keyof Thresholds] = t;
  }
  return set;
}
