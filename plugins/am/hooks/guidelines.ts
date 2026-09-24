// Session start step: where the Harness config has `"guidelines": true`, the Guidelines' index
// goes into Claude's context, with ${CLAUDE_PLUGIN_ROOT} replaced by the plugin's path so Claude
// can read the Guideline files it names when a task calls for one (ADR 0019).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

// The index, as Claude should see it.
export function index(root = ROOT): string {
  const text = readFileSync(join(root, "guidelines", "index.md"), "utf8");
  return text.replaceAll("${CLAUDE_PLUGIN_ROOT}", root).trimEnd();
}
