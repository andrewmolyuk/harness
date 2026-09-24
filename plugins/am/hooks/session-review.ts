// SessionEnd hook: in a repo that keeps .about/ at its root, or whose .harness.json has
// `"sessionReview": true`, review the finished conversation with the glossary and adr skills in
// a detached headless run at the repo root, where both sit (ADR 0018); `"sessionReview": false`
// turns it off (ADR 0011). It only edits .about/, never commits, and never delays the exit:
// anything missing means it quietly does nothing.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { load, repoRoot } from "../lib/config";

type Input = { cwd?: string; transcript_path?: string };
type Block = { type?: string; text?: string };
type Line = { type?: string; message?: { role?: string; content?: string | Block[] } };

const MIN_CHARS = 2_000; // shorter than this can't have settled a term or a decision
const MAX_CHARS = 200_000; // keep the tail of long sessions

const PROMPT = `The conversation that just ended is on stdin. Use the am:glossary and am:adr
skills to record what it settled in .about/. Nobody can answer questions: record only what the
conversation clearly agreed; put anything contested or unanswered in the glossary's
## Unresolved or in a proposed ADR. Change nothing else, and end with one line per change.`;

// `sessionReview` from the Harness config if it's true or false, else whether .about/ exists at
// the repo root. A broken config counts as none: at session end there is no one to tell.
export function wanted(root: string): boolean {
  let setting: unknown;
  try {
    setting = load(root)?.sessionReview;
  } catch {}
  return typeof setting === "boolean" ? setting : existsSync(join(root, ".about"));
}

// User and assistant text only: no tool calls or tool results.
export function conversation(jsonl: string): string {
  const out: string[] = [];
  for (const raw of jsonl.split("\n")) {
    let line: Line;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    if (line.type !== "user" && line.type !== "assistant") continue;
    const content = line.message?.content;
    const text =
      typeof content === "string"
        ? content
        : (content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
    if (text.trim()) out.push(`${line.type}: ${text}`);
  }
  return out.join("\n\n").slice(-MAX_CHARS);
}

async function main() {
  if (process.env.AM_SESSION_REVIEW) return; // the review's own session ending
  const claude = Bun.which("claude");
  if (!claude) return;

  const input = (await Bun.stdin.json()) as Input;
  const project = process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
  const transcript_path = input.transcript_path;
  if (!project || !transcript_path) return;
  const root = repoRoot(project) ?? project;
  if (!wanted(root) || !existsSync(transcript_path)) return;

  const convo = conversation(await Bun.file(transcript_path).text());
  if (convo.length < MIN_CHARS) return;

  const convoFile = join(tmpdir(), `am-session-review-${process.pid}.txt`);
  const log = join(tmpdir(), "am-session-review.log");
  writeFileSync(convoFile, convo);
  appendFileSync(log, `== ${new Date().toISOString()} ${root}\n`);

  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? resolve(import.meta.dir, "..");
  const args = ["-p", PROMPT, "--plugin-dir", pluginRoot, "--allowedTools"];
  args.push("Read", "Glob", "Grep", "Edit(./.about/**)", "Write(./.about/**)");
  const out = openSync(log, "a");
  spawn(claude, args, {
    cwd: root,
    detached: true,
    stdio: [openSync(convoFile, "r"), out, out],
    env: { ...process.env, AM_SESSION_REVIEW: "1" },
  }).unref();
  unlinkSync(convoFile); // the child keeps its open handle
}

if (import.meta.main) main().catch(() => {}); // never fail the exit
