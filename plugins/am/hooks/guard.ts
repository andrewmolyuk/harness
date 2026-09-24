// PreToolUse hook on Bash, Read and Grep: deny git and shell commands that destroy work or data
// and can't be undone, or that skip the Git hooks, and any tool call that would Leak a Secret
// into Claude's context or mark an Env file as holding none (ADR 0004, 0013). Claude is told
// why and to leave it to the user.
// A project's .harness.json can add blocks, never lift one. Unusable input is allowed.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { ALLOW, isEnvFile } from "../githooks/no-secrets";
import { type Block, readConfig } from "../lib/config";

type Input = {
  cwd?: string;
  tool_name?: string;
  tool_input?: { command?: string; file_path?: string; path?: string; glob?: string };
};

const WRAPPERS = new Set(["sudo", "doas", "env", "command", "exec", "nohup", "time", "xargs"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const ROOTS = new Set(["/", "/*", "~", "~/", "~/*", "$HOME", "${HOME}", "$HOME/*", ".", "./",
  "./*", "..", "../", "*"]);
// Programs that show a file's contents.
const READERS = new Set(["cat", "bat", "less", "more", "head", "tail", "tac", "nl", "grep",
  "egrep", "fgrep", "rg", "ag", "sed", "awk", "cut", "sort", "uniq", "strings", "xxd", "od",
  "hexdump", "base64", "jq", "yq", "diff", "column", "view"]);
// READERS whose first argument is a pattern or script, not a file, unless given with -e or -f.
const PATTERN_FIRST = new Set(["grep", "egrep", "fgrep", "rg", "ag", "sed", "awk", "jq", "yq"]);
const KEY_FILE = /(^|\/)id_(rsa|dsa|ecdsa|ed25519)[^/]*$|\.(pem|key)$/;
const SECRET_FILES = [".aws/credentials", ".netrc", ".docker/config.json", ".config/gh/hosts.yml"];
// A variable name with one of these parts holds a Secret: API_KEY, GITHUB_TOKEN, DB_PASSWORD…
const SECRET_NAME = /^(\w*KEY|\w*TOKEN|\w*SECRET|PASSWORD|PASSWD|PASS|CREDENTIALS?|PAT)$/;

// Commands split on ; & | ( ) ` and newlines, words unquoted; enough to find each program and
// its arguments, not a full shell parser.
export function parse(command: string): string[][] {
  const cmds: string[][] = [[]];
  let word: string | null = null;
  let quote = "";
  const flush = () => {
    if (word !== null) cmds.at(-1)!.push(word);
    word = null;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (quote) {
      if (c === quote) quote = "";
      else if (c === "\\" && quote === '"' && i + 1 < command.length) word += command[++i];
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      word ??= "";
    } else if (c === "\\" && i + 1 < command.length) {
      word = (word ?? "") + command[++i];
    } else if (";&|()`\n".includes(c)) {
      flush();
      cmds.push([]);
    } else if (/\s/.test(c)) {
      flush();
    } else {
      word = (word ?? "") + c;
    }
  }
  flush();
  return cmds.filter((c) => c.length > 0);
}

// Each program the command runs and its arguments: past wrappers (sudo, env…) and assignments,
// and into `eval` and `sh -c`. A bare `env` runs nothing and prints the environment.
function* programs(command: string): Generator<[string, string[]]> {
  for (let words of parse(command)) {
    while (/^\w+=/.test(words[0] ?? "") || WRAPPERS.has(words[0] ?? "")) {
      const wrapper = words[0];
      words = words.slice(1);
      while (words[0]?.startsWith("-") || /^\w+=/.test(words[0] ?? "")) words = words.slice(1);
      if (wrapper === "env" && !words.length) yield ["env", []];
    }
    const [path, ...args] = words;
    if (!path) continue;
    const name = path.split("/").at(-1)!;
    if (name === "eval") yield* programs(args.join(" "));
    else if (SHELLS.has(name) && args.includes("-c"))
      yield* programs(args[args.indexOf("-c") + 1] ?? "");
    else yield [name, args];
  }
}

// `-f` also matches combined short flags such as `-fd`.
function has(args: string[], ...flags: string[]): boolean {
  return args.some(
    (a) =>
      flags.includes(a) ||
      flags.some((f) => /^-[a-zA-Z]$/.test(f) && /^-[a-zA-Z]+$/.test(a) && a.includes(f[1]!)),
  );
}

function git(args: string[]): string | null {
  // Skip global options: -C <path>, -c <key=value>, --git-dir=…
  while (args[0]?.startsWith("-")) {
    if (args[0] === "-c" && /^core\.hookspath=/i.test(args[1] ?? ""))
      return "git -c core.hooksPath=… skips the Git hooks";
    args = args.slice(args[0] === "-C" || args[0] === "-c" ? 2 : 1);
  }
  const [sub, ...rest] = args;
  const paths = rest.filter((a) => !a.startsWith("-"));
  switch (sub) {
    case "commit":
      return has(rest, "--no-verify", "-n") ? "git commit --no-verify skips the Git hooks" : null;
    case "merge":
      return has(rest, "--no-verify") ? "git merge --no-verify skips the Git hooks" : null;
    case "push":
      if (has(rest, "--no-verify")) return "git push --no-verify skips the Git hooks";
      if (has(rest, "--force", "-f", "--mirror") || rest.some((a) => a.startsWith("+")))
        return "git push --force rewrites remote history; --force-with-lease is allowed";
      if (has(rest, "--delete", "-d") || paths.some((a) => a.startsWith(":")))
        return "git push --delete removes a remote branch";
      return null;
    case "reset":
      return has(rest, "--hard", "--merge", "--keep") ? "git reset --hard discards changes" : null;
    case "clean":
      return has(rest, "--force", "-f") ? "git clean -f deletes untracked files" : null;
    case "checkout":
      return has(rest, "--force", "-f") || paths.includes(".")
        ? "git checkout . / -f discards uncommitted changes"
        : null;
    case "restore":
      return paths.some((a) => a === "." || a === ":/") &&
        (!has(rest, "--staged", "-S") || has(rest, "--worktree", "-W"))
        ? "git restore . discards uncommitted changes"
        : null;
    case "switch":
      return has(rest, "--discard-changes", "--force", "-f")
        ? "git switch --discard-changes discards uncommitted changes"
        : null;
    case "branch":
      return has(rest, "-D") || (has(rest, "--delete", "-d") && has(rest, "--force", "-f"))
        ? "git branch -D deletes an unmerged branch"
        : null;
    case "stash":
      return ["drop", "clear"].includes(rest[0]!) ? "git stash drop/clear loses stashes" : null;
    case "reflog":
      return ["expire", "delete"].includes(rest[0]!) ? "git reflog expire loses history" : null;
    case "filter-branch":
    case "filter-repo":
      return `git ${sub} rewrites the whole history`;
    default:
      return null;
  }
}

function program(name: string, args: string[]): string | null {
  switch (name) {
    case "git":
      return git(args);
    case "rm":
      if (has(args, "--no-preserve-root")) return "rm --no-preserve-root";
      return has(args, "-r", "-R", "--recursive") && args.some((a) => ROOTS.has(a))
        ? "rm -r on /, ~, . or * deletes everything below it"
        : null;
    case "dd":
      return args.some((a) => a.startsWith("of=/dev/")) ? "dd onto a device erases a disk" : null;
    case "diskutil":
      return /^(erase|zero|randomize|secureErase|partitionDisk)/i.test(args[0] ?? "")
        ? `diskutil ${args[0]} erases a disk`
        : null;
    case "chmod":
    case "chown":
      return has(args, "-R") && args.some((a) => ROOTS.has(a))
        ? `${name} -R on /, ~ or . changes every file below it`
        : null;
    default:
      return name.startsWith("mkfs") ? `${name} formats a disk` : null;
  }
}

// Why the command is dangerous, or null when it isn't.
export function check(command: string, extra: Block[] = []): string | null {
  for (const { pattern, reason } of extra) if (pattern.test(command)) return reason;
  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(command)) return "fork bomb";
  if (/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(command))
    return "piping a download into a shell runs unreviewed code";
  if (/>\s*\/dev\/(sd|disk|nvme|hd)/.test(command)) return "writing to a raw disk device";
  const words = parse(command).flat().map((w) => w.replace(/^[<>]+/, ""));
  if (command.includes(ALLOW) && words.some(isEnvFile))
    return `only the user marks an env file as holding no secrets (${ALLOW})`;
  for (const [name, args] of programs(command)) {
    const reason = program(name, args);
    if (reason) return reason;
  }
  return null;
}

const secretName = (name: string) =>
  name.toUpperCase().split(/[_.-]/).some((part) => SECRET_NAME.test(part));
const variables = (arg: string) => [...arg.matchAll(/\$\{?([A-Za-z_]\w*)/g)].map((m) => m[1]!);

// Why showing the file would Leak a Secret, or null. An Env file with `am:allow-secret` on its
// first line holds none; `dir` resolves a relative path.
export function secretFile(path: string, dir = "."): string | null {
  const p = path.replace(/^(~|\$HOME|\$\{HOME\})(?=\/|$)/, homedir());
  if (isEnvFile(p)) {
    let marked = false;
    try {
      marked = readFileSync(resolve(dir, p), "utf8").split("\n")[0]!.includes(ALLOW);
    } catch {} // missing or unreadable: unmarked
    return marked ? null : `${path} is an env file`;
  }
  if (KEY_FILE.test(p) && !p.endsWith(".pub")) return `${path} holds a private key`;
  if (SECRET_FILES.some((f) => p === f || p.endsWith(`/${f}`))) return `${path} holds secrets`;
  return null;
}

function leaking(name: string, args: string[], dir: string): string | null {
  // A file shown by one of the READERS, or redirected into any program: `… < .env`.
  const patternFirst =
    PATTERN_FIRST.has(name) && !has(args, "-e", "-f", "--regexp", "--file", "--expression");
  const pattern = patternFirst ? args.findIndex((a) => !a.startsWith("-")) : -1;
  const files = args.flatMap((a, i) =>
    a.startsWith("<") ? [a.slice(1) || args[i + 1] || ""]
    : READERS.has(name) && i !== pattern ? [a]
    : []);
  for (const file of files) {
    const reason = secretFile(file, dir);
    if (reason) return reason;
  }
  const named = args.filter((a) => !a.startsWith("-"));
  switch (name) {
    case "env":
    case "printenv": {
      if (!named.length) return `${name} prints every environment variable`;
      const secret = name === "printenv" && named.find(secretName);
      return secret ? `printenv ${secret} prints a secret` : null;
    }
    case "export":
    case "declare":
    case "typeset": {
      if (!named.length) return `${name} prints every exported variable`;
      const secret = has(args, "-p") && named.find(secretName);
      return secret ? `${name} -p ${secret} prints a secret` : null;
    }
    case "set":
      return args.length ? null : "set prints every shell variable";
    case "echo":
    case "printf":
    case "print": {
      const secret = args.flatMap(variables).find(secretName);
      return secret ? `${name} $${secret} prints a secret` : null;
    }
    case "gh":
      return args[0] === "auth" &&
        (args[1] === "token" || (args[1] === "status" && has(args, "--show-token", "-t")))
        ? "gh auth token prints a secret"
        : null;
    case "security":
      return /^find-(generic|internet)-password$/.test(args[0] ?? "") && has(args, "-w", "-g")
        ? `security ${args[0]} -w prints a password`
        : null;
    case "aws":
      return args[0] === "configure" &&
        (args[1] === "export-credentials" || (args[1] === "get" && secretName(args[2] ?? "")))
        ? `aws configure ${args[1]} prints a secret`
        : null;
    case "op":
      return args[0] === "read" ? "op read prints a secret" : null;
    case "git":
      return args.includes("credential") && args.includes("fill")
        ? "git credential fill prints a secret"
        : null;
    default:
      return null;
  }
}

// Why the command would Leak a Secret into Claude's context, or null when it wouldn't.
export function leak(command: string, dir = "."): string | null {
  for (const [name, args] of programs(command)) {
    const reason = leaking(name, args, dir);
    if (reason) return reason;
  }
  return null;
}

async function main() {
  const input = (await Bun.stdin.json()) as Input;
  const { tool_name, tool_input } = input;
  const project = process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
  const cwd = input.cwd ?? project ?? ".";
  let reason: string | null = null;
  let secret: string | null = null;
  if (tool_name === "Bash" && tool_input?.command) {
    reason = check(tool_input.command, project ? readConfig(project).guard : []);
    if (!reason) secret = leak(tool_input.command, cwd);
  } else if (tool_name === "Read" || tool_name === "Grep") {
    const paths = [tool_input?.file_path, tool_input?.path, tool_input?.glob];
    for (const p of paths) secret ??= typeof p === "string" && p ? secretFile(p, cwd) : null;
  }
  const why = reason
    ? `${reason}. If it's really needed, ask the user to run it themselves with \`! <command>\`.`
    : secret
      ? `${secret}: showing it would put a secret into this session. If it's really needed, ask ` +
        "the user to look in their own terminal, not with `!`, whose output enters the session."
      : null;
  if (!why) return;
  const hookSpecificOutput = {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: `Blocked by the am guard: ${why}`,
  };
  console.log(JSON.stringify({ hookSpecificOutput }));
}

if (import.meta.main) main().catch(() => {}); // unusable input: allow
