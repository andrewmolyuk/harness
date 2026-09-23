// Built-in check am:conventional-commits (commit-msg): the subject is
// `type(scope)!: description`. Copied into a project's hooks folder, so it imports nothing
// from the plugin.
import { readFileSync } from "node:fs";

const TYPES = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore",
  "revert"];
const SUBJECT = new RegExp(`^(${TYPES.join("|")})(\\([^()\\s]+\\))?!?: \\S`);
const GIT = /^(Merge |Revert "|fixup! |squash! |amend! )/; // messages git writes itself

// Why the message isn't a Conventional Commit, or null when it is.
export function check(message: string): string | null {
  const subject = message.split("\n").find((l) => l.trim() && !l.startsWith("#"));
  if (!subject || GIT.test(subject) || SUBJECT.test(subject)) return null;
  return `"${subject}" is not \`type(scope): description\` with a type from ${TYPES.join(", ")}`;
}

if (import.meta.main) {
  const reason = check(readFileSync(process.argv[2]!, "utf8"));
  if (reason) {
    console.error(`am:conventional-commits: ${reason}`);
    process.exit(1);
  }
}
