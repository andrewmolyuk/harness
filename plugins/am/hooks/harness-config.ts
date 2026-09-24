// SessionStart hook: at the root of the git repo, create .harness.json with every setting off,
// or add the top-level keys an existing one lacks, leaving its values and their order alone
// (ADR 0016). Running at all means the am plugin is enabled here, so it needs no other opt-in.
// It also names an .about/ or .harness.json left in the Project folder below the root, which
// nothing reads (ADR 0018). Problems are reported to Claude; outside a git repo it quietly does
// nothing.
import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "../lib/config";

type Input = { cwd?: string };

export const SCHEMA =
  "https://raw.githubusercontent.com/andrewmolyuk/harness/main/plugins/am/harness.schema.json";
// Each value keeps the hook it drives doing what it does without the key. `sessionReview` is
// left out: without it the Session review runs where .about/ exists, which false would stop.
export const DEFAULTS: Record<string, unknown> = {
  $schema: SCHEMA,
  guard: { block: [] },
  statusLine: false,
  gitHooks: {},
  guidelines: false,
};

// The file holds only what changes nothing, so the message says where the other options are.
export const CREATED =
  "created .harness.json with every setting off; switch one on by changing its value. " +
  "Every option, with what it does, is in the schema its $schema names; editors complete them.";

// Creates or completes the repo's Harness config; returns what Claude should be told.
export function ensure(dir: string): string[] {
  const root = repoRoot(dir);
  if (!root) return [];
  return [...stray(dir, root), ...complete(join(root, ".harness.json"))];
}

// The .about/ and .harness.json in `dir` when it isn't the repo root, each with where it belongs.
function stray(dir: string, root: string): string[] {
  const below = relative(root, realpathSync(dir));
  if (!below) return [];
  return [".about", ".harness.json"]
    .filter((name) => existsSync(join(dir, name)))
    .map((name) => `${below}/${name} is ignored: the am plugin reads ${name} at the repo root`);
}

function complete(file: string): string[] {
  if (!existsSync(file)) {
    write(file, DEFAULTS);
    return [CREATED];
  }
  const text = readFileSync(file, "utf8");
  let config: unknown;
  try {
    config = JSON.parse(text);
  } catch {}
  if (!config || typeof config !== "object" || Array.isArray(config))
    return [".harness.json is not a JSON object; left as it is"];
  const missing = Object.keys(DEFAULTS).filter((key) => !(key in config));
  if (!missing.length) return [];
  if (!Object.keys(config).length) write(file, DEFAULTS);
  else writeFileSync(file, insert(text, missing));
  return [`.harness.json: added ${missing.join(", ")}`];
}

// The text with the missing keys added, `$schema` first and the rest last, in its indentation,
// so the user's own lines stay as they were.
function insert(text: string, missing: string[]): string {
  const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? "  ";
  const entry = (key: string) =>
    `${indent}${JSON.stringify(key)}: ${JSON.stringify(DEFAULTS[key])}`;
  const rest = missing.filter((key) => key !== "$schema");
  let out = text;
  if (rest.length) {
    const end = out.lastIndexOf("}");
    const added = rest.map((key) => `,\n${entry(key)}`).join("");
    out = `${out.slice(0, end).trimEnd()}${added}\n${out.slice(end)}`;
  }
  if (missing.includes("$schema")) {
    const start = out.indexOf("{") + 1;
    out = `${out.slice(0, start)}\n${entry("$schema")},${out.slice(start)}`;
  }
  return out;
}

function write(file: string, config: object) {
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
}

async function main() {
  const { cwd } = (await Bun.stdin.json()) as Input;
  const project = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const report = project ? ensure(project) : [];
  if (report.length) console.log(`am harness config:\n${report.join("\n")}`);
}

if (import.meta.main) main().catch(() => {});
