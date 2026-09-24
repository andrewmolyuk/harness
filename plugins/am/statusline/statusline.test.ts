import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bar,
  type Input,
  render,
  repo,
  resetTime,
  THRESHOLDS,
  thresholds,
  visible,
} from "./statusline";

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, "");
const now = new Date(2026, 8, 24, 10, 0);
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

  test("context is yellow from 10% and red from 15%", () => {
    const ctx = (used: number) =>
      render({ context_window: { used_percentage: used } }, null, 120).trim();
    expect(ctx(9.4)).toContain("\x1b[2;32m");
    expect(ctx(10)).toContain("\x1b[2;33m");
    expect(ctx(14.4)).toContain("\x1b[2;33m");
    expect(ctx(15)).toContain("\x1b[2;31m");
  });
});

describe("thresholds", () => {
  test("takes the ones the config sets, and the defaults for the rest", () => {
    expect(thresholds(null)).toEqual({ set: THRESHOLDS, problems: [] });
    expect(thresholds({ statusLine: true })).toEqual({ set: THRESHOLDS, problems: [] });
    const { set } = thresholds({ statusLine: { context: { red: 30 }, sevenDay: { red: 100 } } });
    expect(set).toEqual({
      ...THRESHOLDS,
      context: { yellow: 10, red: 30 },
      sevenDay: { yellow: 80, red: 100 },
    });
    expect(THRESHOLDS.context.red).toBe(15);
  });

  test("uses the defaults in place of wrong ones, and names each", () => {
    const statusLine = {
      week: {},
      fiveHour: 5,
      sevenDay: { blue: 1, red: "x", yellow: 101 },
      context: { yellow: 20, red: 15 },
    };
    expect(thresholds({ statusLine })).toEqual({
      set: THRESHOLDS,
      problems: [
        "statusLine.week is not a bar (context, fiveHour, sevenDay); ignored",
        "statusLine.fiveHour is not an object of yellow and red; the defaults are used",
        "statusLine.sevenDay.blue is not yellow or red; ignored",
        "statusLine.sevenDay.red is not a percentage from 0 to 100; the default is used",
        "statusLine.sevenDay.yellow is not a percentage from 0 to 100; the default is used",
        "statusLine.context: yellow (20) is above red (15); the defaults are used",
      ],
    });
  });

  test("colour the bars", () => {
    const t = thresholds({ statusLine: { context: { yellow: 20, red: 40 } } });
    const ctx = (used: number) =>
      render({ context_window: { used_percentage: used } }, null, 120, t.set).trim();
    expect(ctx(19)).toContain("\x1b[2;32m");
    expect(ctx(20)).toContain("\x1b[2;33m");
    expect(ctx(40)).toContain("\x1b[2;31m");
  });
});

describe("resetTime", () => {
  test("shows the time alone today, and the day otherwise", () => {
    expect(resetTime(at(2026, 8, 24, 14, 5), now)).toBe("14:05");
    expect(resetTime(at(2026, 8, 25, 9, 0), now)).toBe("Fri Sep 25, 09:00");
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
  const git = { branch: "main", staged: 1, untracked: 0, added: 1, modified: 2 };

  test("puts the repo on the left and centres the usage", () => {
    const line = plain(render(input, git, 200));
    expect(line).toStartWith("main | S: 1 U: 0 A: 1 M: 2 ");
    expect(line).toContain("Ctx █░░░░░░░░░ 12% 5h █████░░░░░ 55% (");
    expect(line).toEndWith("7d ████████░░ 81%");
    const mid = line.length - line.indexOf("Ctx");
    expect(line.indexOf("Ctx")).toBe(Math.floor((190 - mid) / 2));
  });

  test("shrinks the bars, then drops the reset time, when narrow", () => {
    expect(plain(render(input, git, 99))).toContain("Ctx █░░░░░░░░░ 12%");
    expect(plain(render(input, git, 98))).toContain("Ctx ░░░░░ 12% 5h ██░░░ 55% (");
    expect(plain(render(input, git, 84))).toContain("55% (");
    expect(plain(render(input, git, 83))).toContain("55% 7d");
  });

  test("never overlaps the left, and shows nothing it lacks", () => {
    expect(plain(render(input, git, 20))).toContain("M: 2 Ctx");
    expect(render({}, null, 120).trim()).toBe("");
    expect(visible(render(input, null, 120))).toBeLessThanOrEqual(110);
  });

  test("shows an empty context bar before the first reply", () => {
    const empty = (context_window: Input["context_window"]) =>
      plain(render({ context_window }, null, 120).trim());
    expect(empty({})).toBe("Ctx ░░░░░░░░░░ 0%");
    expect(empty({ used_percentage: null })).toBe("Ctx ░░░░░░░░░░ 0%");
  });
});

describe("repo", () => {
  test("counts staged, untracked, added and modified files", () => {
    const dir = mkdtempSync(join(tmpdir(), "statusline-"));
    expect(repo(dir)).toBeNull();
    const run = (...args: string[]) => spawnSync("git", ["-C", dir, ...args]);
    run("init", "-q", "-b", "work");
    writeFileSync(join(dir, "a"), "1");
    writeFileSync(join(dir, "b"), "1");
    run("add", "a");
    expect(repo(dir)).toEqual({ branch: "work", staged: 1, untracked: 1, added: 1, modified: 0 });
    writeFileSync(join(dir, "a"), "2");
    expect(repo(dir)?.modified).toBe(1);
    run("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qam", "x");
    writeFileSync(join(dir, "a"), "3");
    run("add", "a");
    expect(repo(dir)).toMatchObject({ staged: 1, added: 0, modified: 0 });
  });
});
