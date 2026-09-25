import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { GitHook } from "../lib/config";
import { script, sync } from "./git-hooks";

const listed = (hooks: Partial<Record<GitHook, string[]>>) =>
  new Map(Object.entries(hooks) as [GitHook, string[]][]);

describe("script", () => {
  test("quotes commands and passes pre-push's stdin to each entry", () => {
    const s = script("pre-push", ["am:linear-history", "echo 'it''s'"]);
    expect(s).toContain("input=$(cat)");
    expect(s).toContain(`printf '%s\\n' "$input" | check linear-history "$@" || exit 1`);
    expect(s).toContain(`sh -c 'echo '\\''it'\\'''\\''s'\\''' pre-push "$@" || exit 1`);
    expect(script("pre-commit", ["x"])).not.toContain("input=");
  });
});

describe("sync", () => {
  let repo: string;
  const git = (...args: string[]) =>
    spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  const hook = (name: string) => join(repo, ".git", "hooks", name);

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "git-hooks-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
  });

  test("does nothing outside a git repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "no-repo-"));
    expect(sync(dir, listed({ "pre-commit": ["true"] }))).toEqual([]);
    expect(existsSync(join(dir, ".git"))).toBe(false);
  });

  test("writes the listed Git hooks, running the Built-in checks from the plugin", () => {
    expect(sync(repo, listed({ "commit-msg": ["am:conventional-commits"], "pre-push": [] })))
      .toEqual([]);
    const written = readFileSync(hook("commit-msg"), "utf8");
    expect(written).toContain("# managed by am");
    expect(written).toContain(`am='${resolve(import.meta.dir, "..", "githooks")}'`);
    expect(statSync(hook("commit-msg")).mode & 0o111).toBeTruthy();
    expect(existsSync(hook("pre-push"))).toBe(true);
    expect(existsSync(hook("pre-commit"))).toBe(false);
    expect(existsSync(hook("am"))).toBe(false);
  });

  test("removes the Built-in checks earlier versions copied, keeping other files", () => {
    mkdirSync(hook("am"));
    writeFileSync(hook("am/no-secrets.ts"), "");
    expect(sync(repo)).toEqual([]);
    expect(existsSync(hook("am/no-secrets.ts"))).toBe(true);
    sync(repo, listed({}));
    expect(existsSync(hook("am"))).toBe(false);
    mkdirSync(hook("am"));
    writeFileSync(hook("am/no-secrets.ts"), "");
    writeFileSync(hook("am/mine.ts"), "");
    sync(repo, listed({ "pre-commit": ["am:no-secrets"] }));
    expect(existsSync(hook("am/no-secrets.ts"))).toBe(false);
    expect(existsSync(hook("am/mine.ts"))).toBe(true);
  });

  test("removes its own Git hooks once no longer listed, and leaves them without a setting", () => {
    sync(repo, listed({ "pre-commit": ["true"] }));
    expect(sync(repo)).toEqual([]);
    expect(existsSync(hook("pre-commit"))).toBe(true);
    sync(repo, listed({}));
    expect(existsSync(hook("pre-commit"))).toBe(false);
  });

  test("leaves a Git hook it didn't write alone and says so", () => {
    writeFileSync(hook("pre-commit"), "#!/bin/sh\nexit 0\n");
    expect(sync(repo, listed({ "pre-commit": ["true"] }))).toEqual([
      "pre-commit: left alone, an existing Git hook the am plugin didn't write",
    ]);
    expect(readFileSync(hook("pre-commit"), "utf8")).toBe("#!/bin/sh\nexit 0\n");
    sync(repo, listed({}));
    expect(existsSync(hook("pre-commit"))).toBe(true);
  });

  test("sets pull.rebase for linear history unless already set", () => {
    sync(repo, listed({ "pre-push": ["am:linear-history"] }));
    expect(git("config", "pull.rebase").stdout.trim()).toBe("true");
    git("config", "pull.rebase", "merges");
    sync(repo, listed({ "pre-push": ["am:linear-history"] }));
    expect(git("config", "pull.rebase").stdout.trim()).toBe("merges");
  });

  test("the generated Git hooks run the checks and commands on commit", () => {
    const checks = ["am:conventional-commits", "am:no-ai-coauthor", `grep -q ok "$1"`];
    sync(repo, listed({ "commit-msg": checks }));
    const commit = (msg: string) => git("commit", "-q", "--allow-empty", "-m", msg).status;
    expect(commit("add stuff ok")).not.toBe(0);
    expect(commit("feat: ok\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"))
      .not.toBe(0);
    expect(commit("feat: nope")).not.toBe(0);
    expect(commit("feat: ok")).toBe(0);
  });

  test("a Git hook skips a Built-in check the plugin no longer has, with a warning", () => {
    writeFileSync(hook("commit-msg"), script("commit-msg", ["am:conventional-commits"], "/gone"));
    chmodSync(hook("commit-msg"), 0o755);
    const run = git("commit", "-q", "--allow-empty", "-m", "add stuff");
    expect(run.status).toBe(0);
    expect(run.stderr).toContain("am:conventional-commits not found");
  });
});
