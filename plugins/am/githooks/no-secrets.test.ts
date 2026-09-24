import { beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leaks, scan } from "./no-secrets";

// Built at runtime, so this file holds no Secret and passes the check itself.
const fake = (prefix: string, body: string) => prefix + body;
const SECRETS: [string, string][] = [
  ["a private key", fake("-----BEGIN RSA ", "PRIVATE KEY-----")],
  ["a private key", fake("-----BEGIN ", "PRIVATE KEY-----")],
  ["an AWS access key", fake("AKIA", "IOSFODNN7EXAMPLE")],
  ["a GitHub token", fake("ghp_", "a1".repeat(18))],
  ["a GitHub token", fake("github_pat_", "A_b1".repeat(16))],
  ["a Slack token", fake("xoxb-", "1234567890-abc")],
  ["a Stripe live key", fake("sk_live_", "a1B2".repeat(6))],
  ["an Anthropic API key", fake("sk-ant-", "api03-".repeat(4))],
  ["an OpenAI API key", fake("sk-proj-", "a1B2".repeat(6))],
  ["a Google API key", fake("AIza", "Sy".repeat(17) + "x")],
];
const diff = (path: string, ...lines: string[]) =>
  `+++ b/${path}\n@@ -0,0 +1,${lines.length} @@\n${lines.map((l) => `+${l}`).join("\n")}\n`;

describe("scan", () => {
  for (const [what, secret] of SECRETS) test(`finds ${what}: ${secret.slice(0, 12)}…`, () => {
    expect(scan(diff("src/a.ts", "const x = 1;", `key = "${secret}"`))).toEqual([
      `src/a.ts:2: ${what}`,
    ]);
  });

  const clean = [
    "sk-learn is a library",
    "const re = /AKIA[0-9A-Z]{16}/;",
    "-----BEGIN PUBLIC KEY-----",
    "ghp_short",
    "sk_test_" + "a1B2".repeat(6),
  ];
  for (const line of clean) test(`passes ${line}`, () => {
    expect(scan(diff("a.ts", line))).toEqual([]);
  });

  test("never reports the secret itself", () => {
    const [, secret] = SECRETS[2]!;
    expect(scan(diff("a.ts", secret)).join("")).not.toContain(secret);
  });

  test("passes a line marked am:allow-secret, and only that line", () => {
    const [, secret] = SECRETS[2]!;
    expect(scan(diff("a.ts", `${secret} // am:allow-secret`, secret))).toEqual([
      "a.ts:2: an AWS access key",
    ]);
  });

  test("ignores removed and context lines, and counts lines per hunk", () => {
    const [, secret] = SECRETS[2]!;
    const text = `+++ b/a.ts\n@@ -3 +3 @@\n-${secret}\n+ok\n@@ -9,0 +10,2 @@\n+ok\n+${secret}\n`;
    expect(scan(text)).toEqual(["a.ts:11: an AWS access key"]);
  });
});

describe("leaks", () => {
  let repo: string;
  const git = (...args: string[]) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  const stage = (path: string, text: string) => {
    mkdirSync(join(repo, path, ".."), { recursive: true });
    writeFileSync(join(repo, path), text);
    git("add", path);
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "no-secrets-"));
    git("init", "-q", "-b", "main");
  });

  test("finds secrets in staged changes only", () => {
    const [, secret] = SECRETS[2]!;
    stage("src/config.ts", `export const key = "${secret}";\n`);
    writeFileSync(join(repo, "unstaged.ts"), secret);
    expect(leaks(repo)).toEqual(["src/config.ts:1: an AWS access key"]);
  });

  test("finds env files, even empty ones, but not their templates", () => {
    for (const path of [".env", "app/.env.local", "prod.env", ".envrc", ".env.example", "env.ts"])
      stage(path, "");
    const env = (p: string) =>
      `${p}: an env file; keep it out of git, or put am:allow-secret on its first line`;
    expect(leaks(repo).sort()).toEqual(
      [".env", ".envrc", "app/.env.local", "prod.env"].map(env).sort(),
    );
  });

  test("passes an env file marked on its first line, and still scans its lines", () => {
    const [, secret] = SECRETS[2]!;
    stage(".env", "# public defaults, am:allow-secret\nPORT=3000\n");
    stage("b.env", "PORT=3000\n# am:allow-secret\n");
    expect(leaks(repo)).toEqual([
      "b.env: an env file; keep it out of git, or put am:allow-secret on its first line",
    ]);
    stage(".env", `# am:allow-secret\nKEY=${secret}\n`);
    expect(leaks(repo)).toContain(".env:2: an AWS access key");
  });

  test("passes a deleted secret", () => {
    const [, secret] = SECRETS[2]!;
    stage("a.ts", secret);
    git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "x");
    git("rm", "-q", "a.ts");
    expect(leaks(repo)).toEqual([]);
  });

  test("exits 1 with where the secret is, but not the secret", () => {
    const [, secret] = SECRETS[2]!;
    stage("a.ts", secret);
    const proc = spawnSync("bun", [join(import.meta.dir, "no-secrets.ts")], {
      cwd: repo,
      encoding: "utf8",
    });
    expect(proc.status).toBe(1);
    expect(proc.stderr).toContain("a.ts:1: an AWS access key");
    expect(proc.stderr).not.toContain(secret);
  });

  test("the check and its test pass the check", () => {
    for (const file of ["no-secrets.ts", "no-secrets.test.ts"]) {
      const text = readFileSync(join(import.meta.dir, file), "utf8");
      expect(scan(diff(file, ...text.split("\n")))).toEqual([]);
    }
  });
});
