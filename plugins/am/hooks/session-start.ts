// SessionStart hook: the am plugin's session start steps, in order, since Claude Code runs an
// event's hooks in parallel and each step needs the Harness config the first one writes. Create
// or complete .harness.json (ADR 0016), read it, bring the Git hooks (ADR 0007) and the Status
// line (ADR 0009) in line with it, then load the Guidelines (ADR 0019). What Claude should know,
// the config's problems among them, is printed once.
import { readConfig } from "../lib/config";
import { sync as syncGitHooks } from "./git-hooks";
import { index } from "./guidelines";
import { ensure } from "./harness-config";
import { sync as syncStatusLine } from "./status-line";

type Input = { cwd?: string };

// What Claude should see at session start, or nothing.
export function start(dir: string): string {
  const report = ensure(dir);
  const found = readConfig(dir);
  const on = found.statusLine === undefined ? undefined : found.statusLine !== false;
  report.push(
    ...found.problems,
    ...syncGitHooks(dir, found.gitHooks),
    ...syncStatusLine(dir, on),
  );
  const out = report.length ? [`am plugin:\n${report.join("\n")}`] : [];
  if (found.guidelines) out.push(index());
  return out.join("\n\n");
}

async function main() {
  const { cwd } = (await Bun.stdin.json()) as Input;
  const project = process.env.CLAUDE_PROJECT_DIR ?? cwd;
  const out = project ? start(project) : "";
  if (out) console.log(out);
}

if (import.meta.main) main().catch(() => {});
