import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command, SETTINGS, sync } from "./status-line";

describe("sync", () => {
  let dir: string;
  const settings = () => JSON.parse(readFileSync(join(dir, SETTINGS), "utf8"));
  const own = (value: unknown) => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, SETTINGS), JSON.stringify(value));
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "status-line-"));
  });

  test("does nothing when off without a settings file, or without a setting", () => {
    expect(sync(dir, false)).toEqual([]);
    expect(sync(dir)).toEqual([]);
    expect(existsSync(join(dir, SETTINGS))).toBe(false);
  });

  test("writes its status line, keeping the other settings", () => {
    own({ permissions: { allow: ["Bash(ls)"] } });
    expect(sync(dir, true, "/v1/it's.ts")).toEqual([]);
    expect(settings()).toEqual({
      permissions: { allow: ["Bash(ls)"] },
      statusLine: { type: "command", command: command("/v1/it's.ts"), padding: 0 },
    });
    expect(command("/v1/it's.ts")).toBe(`bun '/v1/it'\\''s.ts' # managed by am`);
  });

  test("follows the plugin to a new path, and removes its own once off", () => {
    sync(dir, true, "/v1/s.ts");
    sync(dir, true, "/v2/s.ts");
    expect(settings().statusLine.command).toBe(command("/v2/s.ts"));
    sync(dir, undefined);
    expect(settings().statusLine.command).toBe(command("/v2/s.ts"));
    sync(dir, false);
    expect(settings()).toEqual({});
  });

  test("leaves a status line it didn't write alone and says so", () => {
    own({ statusLine: { type: "command", command: "mine.sh" } });
    expect(sync(dir, true)).toEqual([
      `statusLine: left alone, one in ${SETTINGS} the am plugin didn't write`,
    ]);
    expect(sync(dir, false)).toEqual([]);
    expect(settings().statusLine.command).toBe("mine.sh");
  });

  test("reports a settings file that isn't JSON", () => {
    own({});
    writeFileSync(join(dir, SETTINGS), "{");
    expect(sync(dir, true)).toEqual([`${SETTINGS} is not valid JSON; status line left as it is`]);
  });

  test("keeps a settings file it creates out of git", () => {
    const git = (...args: string[]) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    git("init", "-q");
    git("config", "core.excludesFile", "/dev/null");
    sync(dir, true);
    expect(git("status", "--porcelain", "--untracked-files=all").stdout).toBe("");
    expect(readFileSync(join(dir, ".git", "info", "exclude"), "utf8")).toEndWith(`/${SETTINGS}\n`);
  });
});
