import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { merges } from "./linear-history";

// Inside a Git hook, GIT_DIR and friends point at the outer repo.
for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];

const ZERO = "0".repeat(40);
const repo = mkdtempSync(join(tmpdir(), "linear-"));
const git = (...args: string[]) =>
  spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" }).stdout.trim();
const commit = (msg: string) => {
  git("commit", "-q", "--allow-empty", "-m", msg);
  return git("rev-parse", "HEAD");
};
const push = (local: string, remote = ZERO) => `refs/heads/main ${local} refs/heads/main ${remote}`;

let base: string, merge: string, after: string;
beforeAll(() => {
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  base = commit("feat: base");
  git("checkout", "-q", "-b", "side");
  commit("feat: side");
  git("checkout", "-q", "main");
  commit("feat: main");
  git("merge", "-q", "--no-ff", "-m", "Merge side", "side");
  merge = git("rev-parse", "HEAD");
  after = commit("feat: after");
});

describe("merges", () => {
  test("finds a merge commit being pushed", () => {
    expect(merges(push(merge, base), repo)).toEqual([`refs/heads/main ${merge.slice(0, 12)}`]);
  });

  test("checks a new branch against the remote-tracking branches", () => {
    expect(merges(push(after), repo)).toHaveLength(1);
  });

  test("ignores merges the remote already has", () => {
    expect(merges(push(after, merge), repo)).toEqual([]);
  });

  test("checks an unknown remote commit against the remote-tracking branches", () => {
    expect(merges(push(after, "1".repeat(40)), repo)).toHaveLength(1);
  });

  test("ignores deletions and blank lines", () => {
    expect(merges(`\nrefs/heads/x ${ZERO} refs/heads/x ${base}\n`, repo)).toEqual([]);
  });

  test("passes a linear history", () => {
    expect(merges(push(base), repo)).toEqual([]);
  });
});
