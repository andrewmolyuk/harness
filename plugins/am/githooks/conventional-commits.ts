// Built-in check am:conventional-commits (commit-msg): the message follows Conventional Commits
// 1.0.0 — a `type(scope)!: description` subject in any case, a body after a blank line, and a
// `BREAKING CHANGE: description` footer in uppercase. Copied into a project's hooks folder, so
// it imports nothing from the plugin.
import { readFileSync } from "node:fs";

const SUBJECT = /^[a-z][a-z-]*(\([^()\n]+\))?!?: \S/i;
const BREAKING = /^breaking[ -]change\s*:/i;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE: \S/;
const GIT = /^(Merge |Revert "|fixup! |squash! |amend! )/; // messages git writes itself
const SCISSORS = /^# -+ >8 -+$/m; // `git commit -v` puts the diff below this line

// Why the message isn't a Conventional Commit, or null when it is.
export function check(message: string): string | null {
  const lines = message.split(SCISSORS)[0]!.split("\n").filter((l) => !l.startsWith("#"));
  const start = lines.findIndex((l) => l.trim());
  const subject = lines[start];
  if (!subject || GIT.test(subject)) return null;
  if (!SUBJECT.test(subject)) return `"${subject}" is not \`type(scope): description\``;
  if (lines[start + 1]?.trim()) return `leave a blank line between "${subject}" and the body`;
  const footer = lines.slice(start + 1).find((l) => BREAKING.test(l) && !BREAKING_FOOTER.test(l));
  return footer ? `"${footer}" is not \`BREAKING CHANGE: description\`` : null;
}

if (import.meta.main) {
  const reason = check(readFileSync(process.argv[2]!, "utf8"));
  if (reason) {
    console.error(`am:conventional-commits: ${reason}`);
    process.exit(1);
  }
}
