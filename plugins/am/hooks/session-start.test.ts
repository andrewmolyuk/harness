import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WRITTEN } from "../lib/config";
import { CREATED } from "./harness-config";
import { SETTINGS } from "./status-line";

const HOOK = join(import.meta.dir, "session-start.ts");

describe("hook", () => {
  let repo: string;
  const config = (text: string) => writeFileSync(join(repo, ".harness.json"), text);
  const run = () => {
    const proc = spawnSync("bun", [HOOK], {
      input: JSON.stringify({ cwd: repo }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    });
    expect(proc.status).toBe(0);
    return proc.stdout;
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "session-start-"));
    spawnSync("git", ["-C", repo, "init", "-q"]);
  });

  test("on a repo's first session, creates the config and does nothing else", () => {
    expect(run()).toBe(`am plugin:\n${CREATED}\n`);
    expect(JSON.parse(readFileSync(join(repo, ".harness.json"), "utf8"))).toEqual(WRITTEN);
    expect(run()).toBe("");
    expect(existsSync(join(repo, SETTINGS))).toBe(false);
  });

  test("applies the config: Git hooks, Status line and Guidelines", () => {
    config(`{"gitHooks":{"pre-commit":["true"]},"statusLine":true,"guidelines":true}`);
    const out = run();
    expect(out).toStartWith("am plugin:\n.harness.json: added $schema, guard\n\n# am guidelines");
    expect(existsSync(join(repo, ".git", "hooks", "pre-commit"))).toBe(true);
    expect(JSON.parse(readFileSync(join(repo, SETTINGS), "utf8")).statusLine.command)
      .toEndWith("# managed by am");
  });

  test("reports a config that isn't a JSON object once, and leaves it", () => {
    config("[]");
    expect(run()).toBe("am plugin:\n.harness.json isn't a JSON object; none of it applies\n");
    expect(readFileSync(join(repo, ".harness.json"), "utf8")).toBe("[]");
  });

  test("reports a key that isn't a setting", () => {
    config(JSON.stringify({ ...WRITTEN, statusline: true }));
    expect(run()).toBe("am plugin:\n.harness.json: statusline is not a setting; ignored\n");
  });

  test("exits cleanly on unusable input", () => {
    const proc = spawnSync("bun", [HOOK], { input: "not json", encoding: "utf8" });
    expect(proc.status).toBe(0);
    expect(proc.stdout).toBe("");
  });
});
