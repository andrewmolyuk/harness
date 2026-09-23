// Built-in check am:conventional-commits (commit-msg): the message follows Conventional Commits
// 1.0.0 — a `type(scope)!: description` subject in any case, a body after a blank line, and a
// breaking change footer as `BREAKING CHANGE: description`, in uppercase. Footers are the
// trailing paragraphs that open with one. Copied into a project's hooks folder, so it imports
// nothing from the plugin.
import { readFileSync } from "node:fs";

const SUBJECT = /^[\p{L}\p{N}][\p{L}\p{N}-]*(\([^()\n]*[^()\s][^()\n]*\))?!?: \S/u;
// A footer's word token (`-` for spaces; BREAKING CHANGE the one exception) and separator.
const FOOTER = /^([\p{L}\p{N}-]+|BREAKING CHANGE)(: | #)/u;
// Messages git (or a pull request merge) writes itself.
const MERGE = /^Merge (branch|branches|remote-tracking branch|tag|commit|pull request) /;
const GIT = new RegExp(`${MERGE.source}|^(Revert|Reapply) "|^(fixup|squash|amend)! `);
const SCISSORS = /^# -+ >8 -+$/m; // `git commit -v` puts the diff below this line

// Why the message isn't a Conventional Commit, or null when it is.
export function check(message: string): string | null {
  const lines = message.split(SCISSORS)[0]!.split("\n").filter((l) => !l.startsWith("#"));
  const start = lines.findIndex((l) => l.trim());
  const subject = lines[start];
  if (!subject || GIT.test(subject)) return null;
  if (!SUBJECT.test(subject)) return `"${subject}" is not \`type(scope): description\``;
  if (lines[start + 1]?.trim()) return `leave a blank line between "${subject}" and the body`;
  const paragraphs = lines.slice(start + 1).join("\n").trim().split(/\n\s*\n/);
  const footers: string[] = [];
  for (const p of paragraphs.reverse()) {
    if (!FOOTER.test(p)) break; // the body
    footers.push(...p.split("\n"));
  }
  const footer = footers.find((l) => {
    const [, token, separator] = FOOTER.exec(l) ?? [];
    return /^breaking[ -]change$/i.test(token ?? "") &&
      (token !== token!.toUpperCase() || separator !== ": ");
  });
  return footer ? `"${footer}" is not \`BREAKING CHANGE: description\`` : null;
}

if (import.meta.main) {
  const reason = check(readFileSync(process.argv[2]!, "utf8"));
  if (reason) {
    console.error(`am:conventional-commits: ${reason}`);
    process.exit(1);
  }
}
