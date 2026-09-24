// SessionStart hook: in a project whose .harness.json has `"guidelines": true`, print the
// Guidelines' index into Claude's context, with ${CLAUDE_PLUGIN_ROOT} replaced by the plugin's
// path so Claude can read the Guideline files it names when a task calls for one (ADR 0019).
// A wrong value is reported to Claude; without the config it quietly does nothing.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { load } from "../lib/config";

type Input = { cwd?: string };

const ROOT = resolve(import.meta.dir, "..");

// What Claude should see at session start, or nothing.
export function guidelines(dir: string, root = ROOT): string {
  let config;
  try {
    config = load(dir);
  } catch (e) {
    return `am guidelines:\n${(e as Error).message}; guidelines not loaded`;
  }
  const on = config?.guidelines ?? false;
  if (typeof on !== "boolean") return "am guidelines:\n.harness.json: guidelines is not a boolean";
  if (!on) return "";
  const index = readFileSync(join(root, "guidelines", "index.md"), "utf8");
  return index.replaceAll("${CLAUDE_PLUGIN_ROOT}", root).trimEnd();
}

async function main() {
  const { cwd } = (await Bun.stdin.json()) as Input;
  const project = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const out = project ? guidelines(project) : "";
  if (out) console.log(out);
}

if (import.meta.main) main().catch(() => {});
