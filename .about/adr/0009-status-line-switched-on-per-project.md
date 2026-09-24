# The Status line is switched on per project, from the harness config

Status: accepted
Date: 2026-09-24

The `am` plugin ships a Status line (branch and file counts; context, 5-hour and 7-day usage
bars). A plugin can't set Claude Code's `statusLine` itself, so a SessionStart hook writes it
into the project's `.claude/settings.local.json` when the Harness config has
`"statusLine": true`, and takes it out again when that is gone. The switch is committed, so it
applies to everyone who has the `am` plugin and clones the repo: these are mostly one person's
projects (ADR 0007), and a status line someone wrote in `settings.local.json` is left alone.
This replaces ADR 0008, which called the Status line per-user.

## Considered options

- A personal switch, in the user's settings or an environment variable — truly per-user, but
  turned on again in each project or on each machine, for little gain while a project has one
  user.
- `~/.claude/settings.json` — would change every project, not only the one that opted in.
- `.claude/settings.json` — committed, so it would set a path from one user's machine for
  everyone.
- A bash script with `jq`, as it was first written — untested, and `date -d` fails on macOS;
  TypeScript run with `bun` (ADR 0003) needs nothing else.

## Consequences

- A teammate with the plugin gets the Status line over their own global one unless they set a
  status line in their `settings.local.json`. Revisit when these projects gain more users.
- The command is `bun` with the absolute path to the script in the installed plugin, which
  changes with every version. The hook recognises its own command by a `# managed by am`
  comment and rewrites it each session start. It leaves a `statusLine` it didn't write alone,
  and says so.
- The hook runs after Claude Code has read the settings, so the first session may start
  without the Status line.
- Where `.claude/settings.local.json` isn't ignored by git, the hook adds it to
  `.git/info/exclude`.
