// Built-in check am:no-secrets (pre-commit): the staged changes add no API key, token or private
// key, and no env file. A line with `am:allow-secret` on it passes, and an env file with it on its
// first line. It reports where a Secret is, never the Secret. Copied into a project's hooks
// folder, so it imports nothing from the plugin.
import { spawnSync } from "node:child_process";

// The first that matches names the Secret, so the more specific come first.
const SECRETS: [string, RegExp][] = [
  ["a private key", /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/],
  ["an AWS access key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["a GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/],
  ["a Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["a Stripe live key", /\b[rs]k_live_[A-Za-z0-9]{20,}/],
  ["an Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["an OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ["a Google API key", /\bAIza[0-9A-Za-z_-]{35}/],
];
const ALLOW = "am:allow-secret";
// .env, .env.local, prod.env…, but not the templates meant to be committed.
const ENV_FILE = /(^|\/)(\.env(\.[^/]*)?|[^/]*\.env)$/;
const TEMPLATE = /\.(example|sample|template|dist)$/;

const isEnvFile = (path: string) => ENV_FILE.test(path) && !TEMPLATE.test(path);

// `<path>:<line>: <what>` for each Secret the diff adds, from `git diff -U0` output.
export function scan(diff: string): string[] {
  const found: string[] = [];
  let path = "";
  let line = 0;
  for (const text of diff.split("\n")) {
    if (text.startsWith("+++ ")) {
      path = text.slice(4).replace(/^b\//, "");
    } else if (text.startsWith("@@")) {
      line = Number(/\+(\d+)/.exec(text)?.[1] ?? 0);
    } else if (text.startsWith("+")) {
      const secret = !text.includes(ALLOW) && SECRETS.find(([, re]) => re.test(text));
      if (secret) found.push(`${path}:${line}: ${secret[0]}`);
      line++;
    }
  }
  return found;
}

function git(cwd: string | undefined, ...args: string[]): string | null {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 30 });
  return r.status === 0 ? r.stdout : null;
}

// The Leaks the staged changes would cause: env files and Secrets. An env file with
// `am:allow-secret` on its first line passes; its lines are still scanned.
export function leaks(cwd?: string): string[] {
  const staged = ["diff", "--cached", "--no-ext-diff", "--diff-filter=ACMR"];
  const names = git(cwd, ...staged, "--name-only", "-z")?.split("\0").filter(Boolean) ?? [];
  const allowed = (p: string) => git(cwd, "show", `:${p}`)?.split("\n")[0]?.includes(ALLOW);
  const env = names
    .filter((p) => isEnvFile(p) && !allowed(p))
    .map((p) => `${p}: an env file; keep it out of git, or put ${ALLOW} on its first line`);
  return [...env, ...scan(git(cwd, ...staged, "-U0", "--no-color") ?? "")];
}

if (import.meta.main) {
  const found = leaks();
  if (found.length) {
    console.error(
      `am:no-secrets: remove each secret, or mark a false alarm with ${ALLOW}:\n` +
        found.join("\n"),
    );
    process.exit(1);
  }
}
