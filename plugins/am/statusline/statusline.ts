// The Status line (ADR 0009): the branch and staged, untracked, added, modified and deleted file
// counts on the left, and context, 5-hour and 7-day usage bars centred on the line. When the line
// is too narrow it shrinks the bars, then drops the 5-hour reset time. The Harness config can set
// the percentages at which each bar turns yellow and red.
import { spawnSync } from "node:child_process";
import { type Config, load } from "../lib/config";

type Limit = { used_percentage?: number; resets_at?: number };
export type Input = {
  workspace?: { current_dir?: string; project_dir?: string };
  context_window?: { used_percentage?: number | null };
  rate_limits?: { five_hour?: Limit; seven_day?: Limit };
};
export type BarThresholds = { yellow: number; red: number };
export type Thresholds = {
  context: BarThresholds;
  fiveHour: BarThresholds;
  sevenDay: BarThresholds;
};
export type Repo = {
  branch: string;
  staged: number;
  untracked: number;
  added: number;
  modified: number;
  deleted: number;
};

const RESET = "\x1b[00m";
const paint = (code: string, text: string) => `\x1b[${code}m${text}${RESET}`;
const label = (text: string) => paint("2;37", text);

export const THRESHOLDS: Thresholds = {
  context: { yellow: 10, red: 15 },
  fiveHour: { yellow: 50, red: 80 },
  sevenDay: { yellow: 80, red: 95 },
};

// The defaults, with the valid `statusLine` thresholds from the Harness config over them, and
// what's wrong with the rest.
export function thresholds(config: Config | null): { set: Thresholds; problems: string[] } {
  const set = structuredClone(THRESHOLDS);
  const problems: string[] = [];
  const given = config?.statusLine;
  if (!given || typeof given !== "object") return { set, problems };
  const percent = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 100;
  for (const [key, value] of Object.entries(given)) {
    const where = `statusLine.${key}`;
    if (!(key in set)) {
      problems.push(`${where} is not a bar (${Object.keys(set).join(", ")}); ignored`);
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      problems.push(`${where} is not an object of yellow and red; the defaults are used`);
      continue;
    }
    const t = { ...set[key as keyof Thresholds] };
    for (const [color, pct] of Object.entries(value)) {
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
  return { set, problems };
}

// A bar and its percentage: dim green, yellow from `yellow`%, red from `red`%.
export function bar(percent: number, width: number, { yellow, red }: BarThresholds): string {
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  const filled = Math.floor((pct * width) / 100);
  const color = pct >= red ? "2;31" : pct >= yellow ? "2;33" : "2;32";
  return `${paint(color, "█".repeat(filled) + "░".repeat(width - filled))} ${pct}%`;
}

// "HH:MM" when the reset falls today, local time, else "Wed Sep 24, 14:00".
export function resetTime(epochSeconds: number, now = new Date()): string {
  const at = new Date(epochSeconds * 1000);
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (at.toDateString() === now.toDateString()) return time;
  const [weekday, month] = at.toDateString().split(" ");
  return `${weekday} ${month} ${String(at.getDate()).padStart(2, "0")}, ${time}`;
}

export function left(repo: Repo | null): string {
  if (!repo) return "";
  const count = (name: string, n: number) =>
    `${label(`${name}:`)} ${paint(n > 0 ? "2;36" : "2;90", String(n))}`;
  return [
    `${paint("01;35", repo.branch)} ${paint("2;90", "|")}`,
    count("S", repo.staged),
    count("U", repo.untracked),
    count("A", repo.added),
    count("M", repo.modified),
    count("D", repo.deleted),
  ].join(" ");
}

export function middle(
  input: Input,
  width: number,
  showReset: boolean,
  t: Thresholds = THRESHOLDS,
): string {
  const parts: string[] = [];
  // Before the first reply the context window has no percentage: show it empty.
  const ctx = input.context_window && (input.context_window.used_percentage ?? 0);
  const five = input.rate_limits?.five_hour;
  const week = input.rate_limits?.seven_day?.used_percentage;
  if (ctx != null) parts.push(`${label("Ctx")} ${bar(ctx, width, t.context)}`);
  if (five?.used_percentage != null) {
    let part = `${label("5h")} ${bar(five.used_percentage, width, t.fiveHour)}`;
    if (showReset && five.resets_at != null)
      part += ` ${paint("2;90", `(${resetTime(five.resets_at)})`)}`;
    parts.push(part);
  }
  if (week != null) parts.push(`${label("7d")} ${bar(week, width, t.sevenDay)}`);
  return parts.join(" ");
}

export const visible = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "").length;

// The whole line for a terminal `columns` wide, less a margin against wrapping.
export function render(
  input: Input,
  repo: Repo | null,
  columns: number,
  t: Thresholds = THRESHOLDS,
): string {
  const width = Math.max(40, columns - 10);
  const l = left(repo);
  let mid = "";
  for (const [barWidth, showReset] of [[10, true], [5, true], [5, false]] as const) {
    mid = middle(input, barWidth, showReset, t);
    if (visible(l) + visible(mid) + 1 <= width) break;
  }
  const start = Math.max(Math.floor((width - visible(mid)) / 2), visible(l) + 1);
  return l + " ".repeat(start - visible(l)) + mid;
}

function git(dir: string, ...args: string[]): string | null {
  const r = spawnSync("git", ["--no-optional-locks", "-C", dir, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function repo(dir: string): Repo | null {
  if (git(dir, "rev-parse", "--show-toplevel") === null) return null;
  const files = (...args: string[]) => (git(dir, ...args) || "").split("\n").filter(Boolean);
  return {
    branch: git(dir, "branch", "--show-current") || git(dir, "rev-parse", "--short", "HEAD") || "",
    staged: files("diff", "--cached", "--name-only").length,
    untracked: files("ls-files", "--others", "--exclude-standard").length,
    added: files("diff", "--cached", "--name-only", "--diff-filter=A").length,
    // S and A (a part of S) count the index; U, M and D the working tree, each file in one.
    modified: files("diff", "--name-only", "--diff-filter=d").length,
    deleted: files("diff", "--name-only", "--diff-filter=D").length,
  };
}

// The status line's input has no width, so $COLUMNS, else `tput cols`, else 120.
function columns(): number {
  const tput = spawnSync("tput", ["cols"], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "ignore"],
  });
  return Number(process.env.COLUMNS) || Number(tput.stdout) || 120;
}

async function main() {
  const input = (await Bun.stdin.json()) as Input;
  const cwd = input.workspace?.current_dir;
  const project = input.workspace?.project_dir ?? cwd;
  let config = null;
  try {
    config = project ? load(project) : null;
  } catch {}
  console.log(render(input, cwd ? repo(cwd) : null, columns(), thresholds(config).set));
}

if (import.meta.main) main().catch(() => {});
