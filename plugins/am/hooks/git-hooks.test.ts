import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import schema from "../harness.schema.json";
import { BUILTINS, GIT_HOOKS, parse, script, sync } from "./git-hooks";

// Inside a Git hook, GIT_DIR and friends point at the outer repo.
for (const key of Object.keys(process.env)) if (key.startsWith("GIT_")) delete process.env[key];

const HOOK = join(import.meta.dir, "git-hooks.ts");

describe("parse", () => {
  test("accepts commands and Built-in checks under their own Git hook", () => {
    const { hooks, errors } = parse({
      "commit-msg": ["am:conventional-commits", "am:no-ai-coauthor"],
      "pre-commit": ["bun run check"],
      "pre-push": [],
    });
    expect(errors).toEqual([]);
    expect([...hooks.keys()]).toEqual(["commit-msg", "pre-commit", "pre-push"]);
  });

  test("reports what's wrong", () => {
    expect(parse([]).errors).toEqual(["gitHooks is not an object"]);
    expect(
      parse({
        "post-merge": ["x"],
        "pre-commit": "bun test",
        "commit-msg": ["am:linear-history", "am:nope", ""],
      }).errors,
    ).toEqual([
      "post-merge is not a supported Git hook (pre-commit, commit-msg, pre-push)",
      "pre-commit is not a list of commands",
      "commit-msg is not a list of commands",
    ]);
    expect(parse({ "commit-msg": ["am:linear-history", "am:nope"] }).errors).toEqual([
      "am:linear-history belongs to pre-push, not commit-msg",
      "am:nope is not a Built-in check",
    ]);
  });

  test("matches the schema", () => {
    const props = schema.properties.gitHooks.properties;
    expect(Object.keys(props)).toEqual([...GIT_HOOKS]);
    const listed = [
      ...props["pre-commit"].items.anyOf[0]!.enum!,
      ...props["commit-msg"].items.anyOf[0]!.enum!,
      ...props["pre-push"].items.anyOf[0]!.enum!,
    ];
    expect(listed).toEqual(Object.keys(BUILTINS).map((b) => `am:${b}`));
  });
});

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
  const config = (value: unknown) =>
    writeFileSync(join(repo, ".harness.json"), JSON.stringify(value));

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "git-hooks-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
  });

  test("does nothing without .harness.json", () => {
    expect(sync(repo)).toEqual([]);
    expect(existsSync(hook("commit-msg"))).toBe(false);
  });

  test("does nothing outside a git repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "no-repo-"));
    writeFileSync(join(dir, ".harness.json"), `{"gitHooks":{"pre-commit":["true"]}}`);
    expect(sync(dir)).toEqual([]);
  });

  test("writes the listed Git hooks and copies the Built-in checks", () => {
    config({ gitHooks: { "commit-msg": ["am:conventional-commits"], "pre-push": [] } });
    expect(sync(repo)).toEqual([]);
    expect(readFileSync(hook("commit-msg"), "utf8")).toContain("# managed by am");
    expect(statSync(hook("commit-msg")).mode & 0o111).toBeTruthy();
    expect(existsSync(hook("pre-push"))).toBe(true);
    expect(existsSync(hook("pre-commit"))).toBe(false);
    expect(existsSync(hook("am/conventional-commits.ts"))).toBe(true);
    expect(existsSync(hook("am/conventional-commits.test.ts"))).toBe(false);
  });

  test("removes its own Git hooks once no longer listed", () => {
    config({ gitHooks: { "pre-commit": ["true"] } });
    sync(repo);
    config({ gitHooks: {} });
    sync(repo);
    expect(existsSync(hook("pre-commit"))).toBe(false);
  });

  test("leaves a Git hook it didn't write alone and says so", () => {
    writeFileSync(hook("pre-commit"), "#!/bin/sh\nexit 0\n");
    config({ gitHooks: { "pre-commit": ["true"] } });
    expect(sync(repo)).toEqual([
      "pre-commit: left alone, an existing Git hook the am plugin didn't write",
    ]);
    expect(readFileSync(hook("pre-commit"), "utf8")).toBe("#!/bin/sh\nexit 0\n");
    config({});
    sync(repo);
    expect(existsSync(hook("pre-commit"))).toBe(true);
  });

  test("changes nothing when the config is wrong", () => {
    config({ gitHooks: { "pre-commit": ["true"] } });
    sync(repo);
    config({ gitHooks: { "pre-commit": ["am:linear-history"] } });
    expect(sync(repo).at(-1)).toBe("Git hooks left as they are");
    expect(readFileSync(hook("pre-commit"), "utf8")).toContain("'true'");
    writeFileSync(join(repo, ".harness.json"), "{");
    expect(sync(repo)).toHaveLength(1);
  });

  test("sets pull.rebase for linear history unless already set", () => {
    config({ gitHooks: { "pre-push": ["am:linear-history"] } });
    sync(repo);
    expect(git("config", "pull.rebase").stdout.trim()).toBe("true");
    git("config", "pull.rebase", "merges");
    sync(repo);
    expect(git("config", "pull.rebase").stdout.trim()).toBe("merges");
  });

  test("the generated Git hooks run the checks and commands on commit", () => {
    config({
      gitHooks: {
        "commit-msg": ["am:conventional-commits", "am:no-ai-coauthor", `grep -q ok "$1"`],
      },
    });
    sync(repo);
    const commit = (msg: string) => git("commit", "-q", "--allow-empty", "-m", msg).status;
    expect(commit("add stuff ok")).not.toBe(0);
    expect(commit("feat: ok\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"))
      .not.toBe(0);
    expect(commit("feat: nope")).not.toBe(0);
    expect(commit("feat: ok")).toBe(0);
  });

  test("runs as a SessionStart hook and reports problems to Claude", () => {
    config({ gitHooks: { nope: [] } });
    const proc = spawnSync("bun", [HOOK], {
      input: JSON.stringify({ cwd: repo }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
    });
    expect(proc.status).toBe(0);
    expect(proc.stdout).toContain("nope is not a supported Git hook");
  });
});
