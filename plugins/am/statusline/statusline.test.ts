import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { THRESHOLDS } from "../lib/config";
import { bar, type Input, branch, render, resetTime, visible } from "./statusline";

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const at = (...args: [number, number, number, number, number]) =>
  new Date(...args).getTime() / 1000;

describe("bar", () => {
  const t = { yellow: 50, red: 80 };
  test("fills by percentage, clamped, coloured by threshold", () => {
    expect(plain(bar(34.6, 10, t))).toBe("███░░░░░░░ 35%");
    expect(plain(bar(150, 5, t))).toBe("█████ 100%");
    expect(plain(bar(-3, 5, t))).toBe("░░░░░ 0%");
    expect(bar(49, 10, t)).toStartWith("\x1b[2;32m");
    expect(bar(50, 10, t)).toStartWith("\x1b[2;33m");
    expect(bar(80, 10, t)).toStartWith("\x1b[2;31m");
  });

  test("context is yellow from 15% and red from 20%", () => {
    const ctx = (used: number) =>
      render({ context_window: { used_percentage: used } }, null, 120).trim();
    expect(ctx(14.4)).toContain("\x1b[2;32m");
    expect(ctx(15)).toContain("\x1b[2;33m");
    expect(ctx(19.4)).toContain("\x1b[2;33m");
    expect(ctx(20)).toContain("\x1b[2;31m");
  });
});

describe("thresholds", () => {
  test("colour the bars", () => {
    const t = { ...THRESHOLDS, context: { yellow: 20, red: 40 } };
    const ctx = (used: number) =>
      render({ context_window: { used_percentage: used } }, null, 120, t).trim();
    expect(ctx(19)).toContain("\x1b[2;32m");
    expect(ctx(20)).toContain("\x1b[2;33m");
    expect(ctx(40)).toContain("\x1b[2;31m");
  });

  test("the script takes them from the Harness config", () => {
    const dir = mkdtempSync(join(tmpdir(), "statusline-"));
    const run = () =>
      spawnSync("bun", [join(import.meta.dir, "statusline.ts")], {
        input: JSON.stringify({
          workspace: { project_dir: dir },
          context_window: { used_percentage: 7 },
        }),
        encoding: "utf8",
      }).stdout;
    expect(run()).toContain("\x1b[2;32m");
    writeFileSync(join(dir, ".harness.json"), `{"statusLine":{"context":{"yellow":5,"red":10}}}`);
    expect(run()).toContain("\x1b[2;33m");
  });
});

describe("resetTime", () => {
  test("shows the time alone, even past midnight", () => {
    expect(resetTime(at(2026, 8, 24, 14, 5))).toBe("14:05");
    expect(resetTime(at(2026, 8, 25, 1, 0))).toBe("01:00");
  });
});

describe("render", () => {
  const input: Input = {
    context_window: { used_percentage: 12 },
    rate_limits: {
      five_hour: { used_percentage: 55, resets_at: at(2026, 8, 24, 14, 0) },
      seven_day: { used_percentage: 81 },
    },
  };
  const model = { model: { display_name: "Opus 5.5" }, effort: { level: "high" } };

  test("puts the branch on the left and centres the usage", () => {
    const line = plain(render(input, "main", 200));
    expect(line).toStartWith("main ");
    expect(line).toContain("Ctx █░░░░░░░░░ 12% 5h █████░░░░░ 55% (");
    expect(line).toEndWith("7d ████████░░ 81%");
    const mid = line.length - line.indexOf("Ctx");
    expect(line.indexOf("Ctx")).toBe(Math.floor((196 - mid) / 2));
  });

  test("puts the model and its effort on the right", () => {
    const line = plain(render({ ...input, ...model }, "main", 200));
    expect(line).toMatch(/81% {2,}Opus 5\.5 \(high\)$/);
    expect(line).toHaveLength(196);
    expect(plain(render({ model: { display_name: "Opus 5.5" } }, null, 120))).toEndWith(
      " Opus 5.5",
    );
  });

  test("shrinks the bars, then drops the reset time, then the model, when narrow", () => {
    const line = (columns: number) => plain(render({ ...input, ...model }, "main", columns));
    expect(line(87)).toContain("Ctx █░░░░░░░░░ 12%");
    expect(line(86)).toContain("Ctx ░░░░░ 12% 5h ██░░░ 55% (");
    expect(line(72)).toContain("55% (");
    expect(line(71)).toContain("55% 7d ████░ 81% Opus 5.5 (high)");
    expect(line(64)).toEndWith("Opus 5.5 (high)");
    expect(line(63)).toEndWith("7d ████░ 81%");
  });

  test("never overlaps the left, and shows nothing it lacks", () => {
    expect(plain(render(input, "a-very-long-branch-name-that-fills-the-line", 20))).toContain(
      "line Ctx",
    );
    expect(render({}, null, 120).trim()).toBe("");
    expect(visible(render(input, null, 120))).toBeLessThanOrEqual(116);
  });

  test("shows an empty context bar before the first reply", () => {
    const empty = (context_window: Input["context_window"]) =>
      plain(render({ context_window }, null, 120).trim());
    expect(empty({})).toBe("Ctx ░░░░░░░░░░ 0%");
    expect(empty({ used_percentage: null })).toBe("Ctx ░░░░░░░░░░ 0%");
    expect(empty({ used_percentage: 0, total_input_tokens: 0 })).toBe("Ctx ░░░░░░░░░░ 0%");
  });

  test("shows the context's tokens after its percentage, rounded to thousands", () => {
    const ctx = (total_input_tokens: number) =>
      plain(render({ context_window: { used_percentage: 60, total_input_tokens } }, null, 120));
    expect(ctx(120_400)).toEndWith("60% (120K)");
    expect(ctx(199_600)).toEndWith("60% (200K)");
    expect(ctx(400)).toEndWith("60% (0K)");
  });
});

describe("branch", () => {
  test("names the branch, or the commit when detached, and null outside a repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "statusline-"));
    expect(branch(dir)).toBeNull();
    const run = (...args: string[]) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    run("init", "-q", "-b", "work");
    expect(branch(dir)).toBe("work");
    run("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty",
      "-m", "x");
    run("checkout", "-q", "--detach");
    expect(branch(dir)).toBe(run("rev-parse", "--short", "HEAD").stdout.trim());
  });
});
