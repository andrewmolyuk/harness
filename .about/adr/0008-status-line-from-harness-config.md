# The status line is installed per project from the harness config

Status: accepted
Date: 2026-09-24

The `am` plugin ships a Status line (branch and file counts; context, 5-hour and 7-day usage
bars). A plugin can't set Claude Code's `statusLine` itself, so a SessionStart hook writes it
into the project's `.claude/settings.local.json` when `.harness.json` has `"statusLine": true`,
and takes it out again when that is gone. It is per-user and per-project, and doesn't change the
committed settings.

## Considered options

- `~/.claude/settings.json` — would change every project, not only the one that opted in.
- `.claude/settings.json` — committed, so it would set a path from one user's machine for
  everyone.
- A bash script with `jq`, as it was first written — untested, and `date -d` fails on macOS;
  TypeScript run with `bun` (ADR 0003) needs nothing else.

## Consequences

- The command is `bun` with the absolute path to the script in the installed plugin, which
  changes with every version. The hook recognises its own command by a `# managed by am`
  comment and rewrites it each session start. It leaves a `statusLine` it didn't write alone,
  and says so.
- The hook runs after Claude Code has read the settings, so the first session may start
  without the Status line.
- Where `.claude/settings.local.json` isn't ignored by git, the hook adds it to
  `.git/info/exclude`.
