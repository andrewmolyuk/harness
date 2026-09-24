// The Status line (ADR 0009): the branch and staged, untracked, added and modified file counts
// on the left, and context, 5-hour and 7-day usage bars centred on the line. When the line is
// too narrow it shrinks the bars, then drops the 5-hour reset time. The Harness config can set
// the percentages at which each bar turns yellow and red.
import { spawnSync } from "node:child_process";
import { load } from "../lib/config";

type Limit = { used_percentage?: number; resets_at?: number };
export type Input = {
  workspace?: { current_dir?: string; project_dir?: string };
  context_window?: { used_percentage?: number | null };
  rate_limits?: { five_hour?: Limit; seven_day?: Limit };
};
export type Threshold = { yellow: number; red: number };
export type Thresholds = { context: Threshold; fiveHour: Threshold; sevenDay: Threshold };
export type Repo = {
  branch: string;
  staged: number;
  untracked: number;
  added: number;
  modified: number;
};

const RESET = "\x1b[00m";
const paint = (code: string, text: string) => `\x1b[${code}m${text}${RESET}`;
const label = (text: string) => paint("2;37", text);

// Context turns yellow at 10% and red above 15%; the rate limits at 50% and 80%.
export const THRESHOLDS: Thresholds = {
  context: { yellow: 10, red: 16 },
  fiveHour: { yellow: 50, red: 80 },
  sevenDay: { yellow: 50, red: 80 },
};

// The defaults, with any valid `statusLine` thresholds from the Harness config over them.
export function thresholds(config: Record<string, unknown> | null): Thresholds {
  const set = config?.statusLine;
  const result = structuredClone(THRESHOLDS);
  if (!set || typeof set !== "object") return result;
  for (const key of Object.keys(result) as (keyof Thresholds)[]) {
    const given = (set as Record<string, unknown>)[key] as Partial<Threshold> | undefined;
    for (const color of ["yellow", "red"] as const)
      if (typeof given?.[color] === "number") result[key][color] = given[color];
  }
  return result;
}

// A bar and its percentage: dim green, yellow from `yellow`%, red from `red`%.
export function bar(percent: number, width: number, yellow = 50, red = 80): string {
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
  const colored = (pct: number, { yellow, red }: Threshold) => bar(pct, width, yellow, red);
  if (ctx != null) parts.push(`${label("Ctx")} ${colored(ctx, t.context)}`);
  if (five?.used_percentage != null) {
    let part = `${label("5h")} ${colored(five.used_percentage, t.fiveHour)}`;
    if (showReset && five.resets_at != null)
      part += ` ${paint("2;90", `(${resetTime(five.resets_at)})`)}`;
    parts.push(part);
  }
  if (week != null) parts.push(`${label("7d")} ${colored(week, t.sevenDay)}`);
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
    modified: files("diff", "--name-only").length,
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
  const dir = input.workspace?.current_dir;
  const project = input.workspace?.project_dir ?? dir;
  let config = null;
  try {
    config = project ? load(project) : null;
  } catch {}
  console.log(render(input, dir ? repo(dir) : null, columns(), thresholds(config)));
}

if (import.meta.main) main().catch(() => {});
