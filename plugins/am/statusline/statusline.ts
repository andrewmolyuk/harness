// The Status line (ADR 0009): the branch on the left, context (with its tokens), 5-hour and 7-day
// usage bars centred on the line, and the model with its effort on the right. When the line is
// too narrow it shrinks the bars, then drops the 5-hour reset time, then the model. The Harness
// config can set the percentages at which each bar turns yellow and red.
import { spawnSync } from "node:child_process";
import { type BarThresholds, readConfig, THRESHOLDS, type Thresholds } from "../lib/config";

type Limit = { used_percentage?: number; resets_at?: number };
export type Input = {
  workspace?: { current_dir?: string; project_dir?: string };
  model?: { display_name?: string };
  effort?: { level?: string };
  context_window?: { used_percentage?: number | null; total_input_tokens?: number };
  rate_limits?: { five_hour?: Limit; seven_day?: Limit };
};

const RESET = "\x1b[00m";
const paint = (code: string, text: string) => `\x1b[${code}m${text}${RESET}`;
const label = (text: string) => paint("2;37", text);

// A bar and its percentage: dim green, yellow from `yellow`%, red from `red`%.
export function bar(percent: number, width: number, { yellow, red }: BarThresholds): string {
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  const filled = Math.floor((pct * width) / 100);
  const color = pct >= red ? "2;31" : pct >= yellow ? "2;33" : "2;32";
  return `${paint(color, "█".repeat(filled) + "░".repeat(width - filled))} ${pct}%`;
}

// "HH:MM", local time: the 5-hour window resets within 5 hours, so the day goes without saying.
export function resetTime(epochSeconds: number): string {
  const at = new Date(epochSeconds * 1000);
  return at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export const left = (branch: string | null) => (branch ? paint("01;35", branch) : "");

// "Opus 5.5 (high)": the model, and its effort when set.
export function right(input: Input): string {
  const model = input.model?.display_name;
  if (!model) return "";
  const effort = input.effort?.level;
  return label(model) + (effort ? ` ${paint("2;90", `(${effort})`)}` : "");
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
  if (ctx != null) {
    let part = `${label("Ctx")} ${bar(ctx, width, t.context)}`;
    // The tokens the percentage counts, in thousands; none before the first reply.
    const tokens = input.context_window?.total_input_tokens;
    if (tokens) part += ` ${paint("2;90", `(${Math.round(tokens / 1000)}K)`)}`;
    parts.push(part);
  }
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

// Claude Code keeps two columns free on each side of the status line and cuts a longer one short.
const MARGIN = 4;

// The whole line for a terminal `columns` wide, the model flush with its right edge.
export function render(
  input: Input,
  branch: string | null,
  columns: number,
  t: Thresholds = THRESHOLDS,
): string {
  const width = Math.max(40, columns - MARGIN);
  const l = left(branch);
  let r = right(input);
  const fits = (mid: string) =>
    visible(l) + visible(mid) + (r ? visible(r) + 1 : 0) + 1 <= width;
  const stages = [[10, true], [5, true], [5, false]] as const;
  let mid = "";
  for (const [barWidth, showReset] of stages) {
    mid = middle(input, barWidth, showReset, t);
    if (fits(mid)) break;
  }
  if (!fits(mid)) r = "";
  const end = r ? width - visible(r) - 1 : width;
  const centred = Math.floor((width - visible(mid)) / 2);
  const start = Math.max(Math.min(centred, end - visible(mid)), visible(l) + 1);
  const line = l + " ".repeat(start - visible(l)) + mid;
  return r ? line + " ".repeat(Math.max(1, width - visible(r) - visible(line))) + r : line;
}

function git(dir: string, ...args: string[]): string | null {
  const r = spawnSync("git", ["--no-optional-locks", "-C", dir, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// The branch, or the commit when detached; null outside a repo.
export function branch(dir: string): string | null {
  if (git(dir, "rev-parse", "--show-toplevel") === null) return null;
  return git(dir, "branch", "--show-current") || git(dir, "rev-parse", "--short", "HEAD") || "";
}

// Claude Code sets $COLUMNS to the terminal's width; the script can't read the terminal itself.
const columns = () => Number(process.env.COLUMNS) || 120;

async function main() {
  const input = (await Bun.stdin.json()) as Input;
  const cwd = input.workspace?.current_dir;
  const project = input.workspace?.project_dir ?? cwd;
  const t = (project && readConfig(project).statusLine) || THRESHOLDS;
  console.log(render(input, cwd ? branch(cwd) : null, columns(), t));
}

if (import.meta.main) main().catch(() => {});
