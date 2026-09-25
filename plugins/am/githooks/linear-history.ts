// Built-in check am:linear-history (pre-push): no merge commits among the commits being
// pushed. Git passes `<local ref> <local sha> <remote ref> <remote sha>` lines on stdin.
import { spawnSync } from "node:child_process";

const ZERO = /^0+$/;

function git(cwd: string | undefined, ...args: string[]): string | null {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// `<ref> <sha>` for each merge commit being pushed. A ref new to the remote, or whose remote
// commit isn't known here, is checked against every remote-tracking branch.
export function merges(input: string, cwd?: string): string[] {
  const found: string[] = [];
  for (const line of input.split("\n")) {
    const [ref, local, , remote] = line.trim().split(/\s+/);
    if (!local || ZERO.test(local)) continue; // a deletion pushes no commits
    const known =
      remote && !ZERO.test(remote) && git(cwd, "cat-file", "-e", `${remote}^{commit}`) !== null;
    const range = known ? [`${remote}..${local}`] : [local, "--not", "--remotes"];
    for (const sha of git(cwd, "rev-list", "--merges", ...range)?.split("\n") ?? [])
      if (sha) found.push(`${ref} ${sha.slice(0, 12)}`);
  }
  return found;
}

if (import.meta.main) {
  const found = merges(await Bun.stdin.text());
  if (found.length) {
    console.error(`am:linear-history: rebase instead of merging; merge commits:\n` +
      found.join("\n"));
    process.exit(1);
  }
}
