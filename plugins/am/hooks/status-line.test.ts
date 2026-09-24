import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import schema from "../harness.schema.json";
import { THRESHOLDS } from "../statusline/statusline";
import { command, SETTINGS, sync } from "./status-line";

const HOOK = join(import.meta.dir, "status-line.ts");

describe("sync", () => {
  let dir: string;
  const settings = () => JSON.parse(readFileSync(join(dir, SETTINGS), "utf8"));
  const config = (value: unknown) =>
    writeFileSync(join(dir, ".harness.json"), JSON.stringify(value));
  const own = (value: unknown) => {
    mkdirSync(join(dir, ".claude"), { recursive: true });
    writeFileSync(join(dir, SETTINGS), JSON.stringify(value));
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "status-line-"));
  });

  test("the schema allows it", () => {
    expect(schema.properties.statusLine.oneOf[0]).toEqual({ type: "boolean" });
    expect(Object.keys(schema.properties.statusLine.oneOf[1].properties ?? {})).toEqual(
      Object.keys(THRESHOLDS),
    );
  });

  test("does nothing without .harness.json or without statusLine", () => {
    expect(sync(dir)).toEqual([]);
    config({});
    expect(sync(dir)).toEqual([]);
    expect(existsSync(join(dir, SETTINGS))).toBe(false);
  });

  test("writes its status line, keeping the other settings", () => {
    own({ permissions: { allow: ["Bash(ls)"] } });
    config({ statusLine: true });
    expect(sync(dir, "/v1/it's.ts")).toEqual([]);
    expect(settings()).toEqual({
      permissions: { allow: ["Bash(ls)"] },
      statusLine: { type: "command", command: command("/v1/it's.ts"), padding: 0 },
    });
    expect(command("/v1/it's.ts")).toBe(`bun '/v1/it'\\''s.ts' # managed by am`);
  });

  test("follows the plugin to a new path, and removes its own once unlisted", () => {
    config({ statusLine: true });
    sync(dir, "/v1/s.ts");
    sync(dir, "/v2/s.ts");
    expect(settings().statusLine.command).toBe(command("/v2/s.ts"));
    config({ statusLine: false });
    sync(dir);
    expect(settings()).toEqual({});
  });

  test("switches it on with thresholds", () => {
    config({ statusLine: { context: { yellow: 20, red: 40 } } });
    sync(dir, "/v1/s.ts");
    expect(settings().statusLine.command).toBe(command("/v1/s.ts"));
  });

  test("reports wrong thresholds, and installs it all the same", () => {
    config({ statusLine: { context: { red: 5 } } });
    expect(sync(dir, "/v1/s.ts")).toEqual([
      ".harness.json: statusLine.context: yellow (15) is above red (5); the defaults are used",
    ]);
    expect(settings().statusLine.command).toBe(command("/v1/s.ts"));
  });

  test("leaves a status line it didn't write alone and says so", () => {
    own({ statusLine: { type: "command", command: "mine.sh" } });
    config({ statusLine: true });
    expect(sync(dir)).toEqual([
      `statusLine: left alone, one in ${SETTINGS} the am plugin didn't write`,
    ]);
    config({});
    expect(sync(dir)).toEqual([]);
    expect(settings().statusLine.command).toBe("mine.sh");
  });

  test("reports a wrong config or settings file", () => {
    config({ statusLine: "yes" });
    const wrong = ".harness.json: statusLine is not true, false or an object of thresholds";
    expect(sync(dir)).toEqual([wrong]);
    config({ statusLine: [] });
    expect(sync(dir)).toEqual([wrong]);
    config({ statusLine: true });
    own({});
    writeFileSync(join(dir, SETTINGS), "{");
    expect(sync(dir)).toEqual([`${SETTINGS} is not valid JSON; status line left as it is`]);
  });

  test("keeps a settings file it creates out of git", () => {
    const git = (...args: string[]) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    git("init", "-q");
    git("config", "core.excludesFile", "/dev/null");
    config({ statusLine: true });
    sync(dir);
    expect(git("status", "--porcelain", "--untracked-files=all").stdout).toBe("?? .harness.json\n");
    expect(readFileSync(join(dir, ".git", "info", "exclude"), "utf8")).toEndWith(`/${SETTINGS}\n`);
  });

  test("runs as a SessionStart hook and reports problems to Claude", () => {
    config({ statusLine: 1 });
    const proc = spawnSync("bun", [HOOK], {
      input: JSON.stringify({ cwd: dir }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir },
    });
    expect(proc.status).toBe(0);
    expect(proc.stdout).toContain("statusLine is not true, false");
  });
});
