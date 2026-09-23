// PreToolUse hook on Bash: deny git and shell commands that destroy work or data and can't be
// undone, or that skip the git hooks. Claude is told why and to leave the command to the user.
// A project's .harness.json can add blocks, never lift one. Unusable input is allowed.
import { type Config, load } from "../lib/config";

type Input = { cwd?: string; tool_name?: string; tool_input?: { command?: string } };
export type Block = { pattern: RegExp; reason: string };

const WRAPPERS = new Set(["sudo", "doas", "env", "command", "exec", "nohup", "time", "xargs"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash"]);
const ROOTS = new Set(["/", "/*", "~", "~/", "~/*", "$HOME", "${HOME}", "$HOME/*", ".", "./",
  "./*", "..", "../", "*"]);

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
      return "git -c core.hooksPath=… skips the git hooks";
    args = args.slice(args[0] === "-C" || args[0] === "-c" ? 2 : 1);
  }
  const [sub, ...rest] = args;
  const paths = rest.filter((a) => !a.startsWith("-"));
  switch (sub) {
    case "commit":
      return has(rest, "--no-verify", "-n") ? "git commit --no-verify skips the git hooks" : null;
    case "merge":
      return has(rest, "--no-verify") ? "git merge --no-verify skips the git hooks" : null;
    case "push":
      if (has(rest, "--no-verify")) return "git push --no-verify skips the git hooks";
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

// The project's extra blocks: `{ "guard": { "block": [{ "pattern", "reason" }] } }`, each
// pattern a regex on the command text. Malformed entries are skipped.
export function blocks(config: Config | null): Block[] {
  const list = (config?.guard as { block?: unknown } | undefined)?.block;
  if (!Array.isArray(list)) return [];
  return list.flatMap((b: { pattern?: unknown; reason?: unknown } | null) => {
    if (typeof b?.pattern !== "string" || typeof b.reason !== "string") return [];
    try {
      return [{ pattern: new RegExp(b.pattern), reason: b.reason }];
    } catch {
      return [];
    }
  });
}

function projectBlocks(dir: string | undefined): Block[] {
  try {
    return dir ? blocks(load(dir)) : [];
  } catch {
    return [];
  }
}

// Why the command is dangerous, or null when it isn't.
export function check(command: string, extra: Block[] = []): string | null {
  for (const { pattern, reason } of extra) if (pattern.test(command)) return reason;
  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(command)) return "fork bomb";
  if (/\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(command))
    return "piping a download into a shell runs unreviewed code";
  if (/>\s*\/dev\/(sd|disk|nvme|hd)/.test(command)) return "writing to a raw disk device";
  for (let words of parse(command)) {
    while (/^\w+=/.test(words[0] ?? "") || WRAPPERS.has(words[0] ?? "")) {
      words = words.slice(1);
      while (words[0]?.startsWith("-") || /^\w+=/.test(words[0] ?? "")) words = words.slice(1);
    }
    const [path, ...args] = words;
    if (!path) continue;
    const name = path.split("/").at(-1)!;
    let reason: string | null;
    if (name === "eval") reason = check(args.join(" "));
    else if (SHELLS.has(name) && args.includes("-c"))
      reason = check(args[args.indexOf("-c") + 1] ?? "");
    else reason = program(name, args);
    if (reason) return reason;
  }
  return null;
}

async function main() {
  const { cwd, tool_name, tool_input } = (await Bun.stdin.json()) as Input;
  if (tool_name !== "Bash" || !tool_input?.command) return;
  const reason = check(tool_input.command, projectBlocks(process.env.CLAUDE_PROJECT_DIR ?? cwd));
  if (!reason) return;
  const hookSpecificOutput = {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: `Blocked by the am guard: ${reason}. If it's really needed, ask ` +
      "the user to run it themselves with `! <command>`.",
  };
  console.log(JSON.stringify({ hookSpecificOutput }));
}

if (import.meta.main) main().catch(() => {}); // unusable input: allow
