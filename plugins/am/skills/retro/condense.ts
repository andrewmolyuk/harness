// Condense Claude Code session transcripts into the signals a Retro needs: the user's prompts
// and commands, failed tool calls by kind, interrupts, and repeated calls. Tool output that
// succeeded is dropped, and anything shaped like a Secret is masked as `*****`.
//
//   bun condense.ts                 the latest session of the project in the working directory
//   bun condense.ts --last 5        its five latest sessions, then a summary across them
//   bun condense.ts <id|file>...    those sessions
//   bun condense.ts <id|file> --around <line>   the lines around one moment, in full but masked
//
// The latest leave out headless sessions (the Session review's, `claude -p`) and sessions where
// nothing but /clear was typed and nothing failed.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";

type Block = {
  type?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  is_error?: boolean;
  content?: unknown;
};
type Line = {
  type?: string;
  isMeta?: boolean;
  entrypoint?: string;
  timestamp?: string;
  cwd?: string;
  aiTitle?: string;
  message?: { content?: string | Block[] };
};

export type Kind =
  | "guard"
  | "hook"
  | "rejected"
  | "permission"
  | "classifier"
  | "stale"
  | "exit"
  | "other";
export type Event =
  | { at: number; type: "prompt"; text: string }
  | { at: number; type: "command"; text: string }
  | { at: number; type: "interrupt" }
  | { at: number; type: "error"; kind: Kind; call: string; text: string };
export type Session = {
  id: string;
  headless: boolean;
  title: string;
  start: string;
  minutes: number;
  tools: Record<string, number>;
  events: Event[];
  repeats: [string, number][];
};

const PROMPT_CHARS = 300;
const AROUND_LINES = 5; // either side of the line asked for
const AROUND_CHARS = 2_000; // per block
const ERROR_CHARS = 200;
const CALL_CHARS = 120;
const REPEAT_MIN = 3;
const PROMPT_MIN = 20; // shorter prompts ("yes", "commit it") repeat without meaning much
const REPEATED = new Set(["Bash", "Read", "Grep", "Glob", "WebFetch"]);

// Private key blocks, and long runs of token characters mixing letters and digits: API keys,
// tokens, JWTs. Pure hex (commit hashes, session ids) stays; `.` splits, so a file name does.
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*KEY-----|$)/g;
const TOKEN = /[A-Za-z0-9_\-+]{32,}/g;
const secret = (s: string) => /[A-Za-z]/.test(s) && /\d/.test(s) && !/^[0-9a-f-]+$/i.test(s);
export function mask(text: string): string {
  return text.replace(PRIVATE_KEY, "*****").replace(TOKEN, (s) => (secret(s) ? "*****" : s));
}

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

export function kind(error: string): Kind {
  if (error.includes("Blocked by the am guard")) return "guard";
  if (/doesn't want to proceed|User rejected/.test(error)) return "rejected";
  if (/hook error/.test(error)) return "hook";
  if (/auto mode classifier|auto mode cannot/.test(error)) return "classifier";
  if (/requires approval|[Pp]ermission to use .* (denied|has been denied)/.test(error))
    return "permission";
  if (/modified since read|has not been read yet/.test(error)) return "stale";
  if (/^Exit code \d+/.test(error)) return "exit";
  return "other";
}

// A tool call by what it acts on: the command, the path, the pattern.
export function call(name: string, input: Record<string, unknown> = {}, cwd = ""): string {
  const value =
    input.command ??
    input.file_path ??
    input.path ??
    input.pattern ??
    input.skill ??
    input.url ??
    input.description ??
    Object.values(input).find((v) => typeof v === "string") ??
    "";
  let text = String(value);
  if (cwd && text.startsWith(`${cwd}/`)) text = relative(cwd, text);
  return `${name}(${text})`;
}

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((b: Block) => (b.type === "text" ? (b.text ?? "") : "")).join("\n")
      : "";

// The user's own words, or null for what Claude Code wrote in the user's turn.
function human(text: string): Event["type"] | null {
  if (/^\[Request interrupted by user/.test(text)) return "interrupt";
  if (/^<command-(name|message)>/.test(text)) return "command";
  if (/^<(local-command|task-notification|system-reminder)/.test(text)) return null;
  if (text.startsWith("Base directory for this skill:")) return null;
  return text.trim() ? "prompt" : null;
}

export function condense(jsonl: string, id = ""): Session {
  const session: Session = {
    id,
    headless: false,
    title: "",
    start: "",
    minutes: 0,
    tools: {},
    events: [],
    repeats: [],
  };
  const calls = new Map<string, string>();
  const counts = new Map<string, number>();
  let first = 0;
  let last = 0;
  let cwd = "";
  let at = 0;

  for (const raw of jsonl.split("\n")) {
    let line: Line;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    at++;
    if (line.aiTitle) session.title = line.aiTitle;
    if (line.cwd) cwd = line.cwd;
    if (line.entrypoint === "sdk-cli") session.headless = true;
    if (line.timestamp) {
      const t = Date.parse(line.timestamp);
      if (!first || t < first) {
        first = t;
        session.start = line.timestamp.slice(0, 16).replace("T", " ");
      }
      last = Math.max(last, t);
    }
    const content = line.message?.content;

    if (line.type === "assistant" && Array.isArray(content)) {
      for (const b of content) {
        if (b.type !== "tool_use" || !b.name) continue;
        session.tools[b.name] = (session.tools[b.name] ?? 0) + 1;
        const c = call(b.name, b.input, cwd);
        if (b.id) calls.set(b.id, c);
        if (REPEATED.has(b.name)) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
    }

    if (line.type !== "user" || line.isMeta) continue;
    if (Array.isArray(content) && content.some((b) => b.type === "tool_result")) {
      for (const b of content) {
        if (b.type !== "tool_result" || !b.is_error) continue;
        const text = textOf(b.content) || String(b.content ?? "");
        const c = calls.get(b.tool_use_id ?? "") ?? "?";
        session.events.push({ at, type: "error", kind: kind(text), call: c, text });
      }
      continue;
    }
    const text = textOf(content);
    const type = human(text);
    if (type === "interrupt") session.events.push({ at, type });
    else if (type === "command") {
      const name = /<command-name>(.*?)<\/command-name>/.exec(text)?.[1] ?? "";
      const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1] ?? "";
      session.events.push({ at, type, text: `${name} ${args}`.trim() });
    } else if (type === "prompt") session.events.push({ at, type, text });
  }

  session.minutes = Math.round((last - first) / 60_000);
  session.repeats = [...counts].filter(([, n]) => n >= REPEAT_MIN).sort((a, b) => b[1] - a[1]);
  return session;
}

type Failure = Extract<Event, { type: "error" }>;

// A failed command's own error is usually at the end of its output.
function gist(e: Failure, max = ERROR_CHARS): string {
  if (e.kind !== "exit") return clip(e.text, max);
  const [code = "", ...rest] = e.text.split("\n");
  const tail = rest.join(" ").replace(/\s+/g, " ").trim();
  return tail.length > max ? `${code}: …${tail.slice(-max)}` : `${code}: ${tail}`;
}

function event(e: Event): string {
  const head = `[${e.at}] ${e.type}`;
  switch (e.type) {
    case "interrupt":
      return head;
    case "error":
      return `${head} ${e.kind} ${clip(e.call, CALL_CHARS)}: ${gist(e)}`;
    default:
      return `${head}: ${clip(e.text, PROMPT_CHARS)}`;
  }
}

export function report(s: Session): string {
  const errors = s.events.filter((e) => e.type === "error").length;
  const calls = Object.values(s.tools).reduce((a, b) => a + b, 0);
  const tools = Object.entries(s.tools)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${name} ${n}`)
    .join(", ");
  const out = [
    `# Session ${s.id}${s.title ? `: ${s.title}` : ""}`,
    `${s.start}, ${s.minutes} min, ${calls} tool calls, ${errors} failed`,
    `Tools: ${tools || "none"}`,
    "",
    ...s.events.map(event),
  ];
  if (s.repeats.length)
    out.push("", "Repeated calls:", ...s.repeats.map(([c, n]) => `${n}× ${clip(c, CALL_CHARS)}`));
  return mask(out.join("\n"));
}

// Prompts the user typed more than once, across sessions: work a skill or hook could take over.
function repeatedPrompts(sessions: Session[]): string[] {
  const counts = new Map<string, number>();
  for (const s of sessions)
    for (const e of s.events) {
      if (e.type !== "prompt") continue;
      const text = clip(e.text.toLowerCase(), 100);
      if (text.length >= PROMPT_MIN) counts.set(text, (counts.get(text) ?? 0) + 1);
    }
  return [...counts]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([text, n]) => `  ${n}× ${text}`);
}

// Failed calls across sessions, by kind, then the commonest within each: the call for a failed
// command, a rejected or unjudged call, the message for the rest. Then repeated prompts.
export function summary(sessions: Session[]): string {
  const byKind = new Map<Kind, Map<string, { n: number; ids: Set<string> }>>();
  for (const s of sessions)
    for (const e of s.events) {
      if (e.type !== "error") continue;
      const lines = byKind.get(e.kind) ?? new Map();
      const byCall = e.kind === "exit" || e.kind === "rejected" || e.kind === "classifier";
      const key = byCall ? e.call.slice(0, e.call.indexOf("(")) : clip(e.text, 100);
      const seen = lines.get(key) ?? { n: 0, ids: new Set<string>() };
      seen.n++;
      seen.ids.add(s.id);
      lines.set(key, seen);
      byKind.set(e.kind, lines);
    }
  const total = (m: Map<string, { n: number }>) => [...m.values()].reduce((a, v) => a + v.n, 0);
  const out = [`# Across ${sessions.length} sessions`];
  for (const [k, lines] of [...byKind].sort((a, b) => total(b[1]) - total(a[1]))) {
    out.push(`${k}: ${total(lines)}`);
    const top = [...lines].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
    for (const [key, { n, ids }] of top) out.push(`  ${n}× in ${ids.size} session(s): ${key}`);
  }
  const prompts = repeatedPrompts(sessions);
  if (prompts.length) out.push("repeated prompts:", ...prompts);
  return mask(out.join("\n"));
}

// The transcript's lines around one, numbered as in the condensed output: text, tool calls and
// their results in full up to a limit, masked. What the Retro reads instead of the raw file, so
// a Secret an earlier session printed doesn't reach its context again.
export function around(jsonl: string, target: number, radius = AROUND_LINES): string {
  const out: string[] = [];
  const full = (text: string) => text.slice(0, AROUND_CHARS);
  let at = 0;
  let cwd = "";
  for (const raw of jsonl.split("\n")) {
    let line: Line;
    try {
      line = JSON.parse(raw);
    } catch {
      continue;
    }
    if (line.cwd) cwd = line.cwd;
    if (++at < target - radius) continue;
    if (at > target + radius) break;
    const content = line.message?.content;
    const blocks: Block[] =
      typeof content === "string" ? [{ type: "text", text: content }] : (content ?? []);
    const head = `[${at}] ${line.type}`;
    for (const b of blocks) {
      if (b.type === "text" && b.text?.trim()) out.push(`${head}: ${full(b.text)}`);
      else if (b.type === "tool_use") out.push(`${head} calls ${call(b.name ?? "", b.input, cwd)}`);
      else if (b.type === "tool_result") {
        const text = textOf(b.content) || String(b.content ?? "");
        out.push(`${head} result${b.is_error ? " (failed)" : ""}: ${full(text)}`);
      }
    }
  }
  return mask(out.join("\n"));
}

// ~/.claude/projects/<the path, each character but a letter or digit as ->.
export const projectDir = (cwd: string, home = homedir()) =>
  join(home, ".claude", "projects", cwd.replace(/[^A-Za-z0-9]/g, "-"));

// The project's transcripts, newest first.
export function latest(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
}

// A session worth a Retro: not headless, and something besides /clear was typed or failed.
export const worth = (s: Session) =>
  !s.headless && s.events.some((e) => e.type !== "command" || !/^\/clear\b/.test(e.text));

const read = (file: string) => condense(readFileSync(file, "utf8"), basename(file, ".jsonl"));

if (import.meta.main) {
  const dir = projectDir(process.cwd());
  const args = process.argv.slice(2);
  const named = (a: string) => (existsSync(a) ? a : join(dir, `${basename(a, ".jsonl")}.jsonl`));
  const i = args.indexOf("--around");
  if (i > 0) {
    console.log(around(readFileSync(named(args[0]), "utf8"), Number(args[i + 1])));
    process.exit(0);
  }
  const n = args[0] === "--last" ? Number(args[1]) || 1 : 0;
  const all: Session[] = [];
  if (args.length && !n) for (const a of args) all.push(read(named(a)));
  else
    for (const file of latest(dir)) {
      const s = read(file);
      if (worth(s)) all.push(s);
      if (all.length === (n || 1)) break;
    }
  if (!all.length) {
    console.error(`No sessions in ${dir}`);
    process.exit(1);
  }
  const parts = all.map(report);
  if (all.length > 1) parts.push(summary(all));
  console.log(parts.join("\n\n"));
}
