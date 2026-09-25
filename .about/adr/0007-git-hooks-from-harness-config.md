# Git hooks are generated from the harness config

Status: superseded by 0020
Date: 2026-09-25

A project lists what each Git hook runs in `.harness.json`, under `gitHooks`: `pre-commit`,
`commit-msg` and `pre-push` each take an ordered list of entries, either a Built-in check
(`am:<name>`) or a shell command, and stop at the first failure. A hook is installed only when
its key is present. A SessionStart hook, running only where `.harness.json` exists, generates
plain `sh` hooks into the folder `git rev-parse --git-path hooks` names and copies the Built-in
checks beside them, so they run without Claude or the plugin and follow each plugin update.

```json
{ "$schema": "<schema URL>",
  "gitHooks": {
    "commit-msg": ["am:conventional-commits", "am:no-ai-coauthor"],
    "pre-commit": ["bun run check"],
    "pre-push":   ["am:linear-history", "bun test"]
} }
```

Built-in checks, each tied to one Git hook (listing it under another fails the sync):
- `am:adr-immutable` (pre-commit) — a committed accepted ADR is only superseded (ADR 0006).
- `am:conventional-commits` (commit-msg) — Conventional Commits 1.0.0 as written: a
  `type(scope)!: description` subject with any type, in any case; a blank line before the body;
  a `BREAKING CHANGE: description` footer in uppercase. git's own `Merge`, `Revert`, `fixup!`,
  `squash!` and `amend!` messages and `#` lines pass.
- `am:no-ai-coauthor` (commit-msg) — no `Co-Authored-By:` naming an AI; human co-authors pass.
- `am:linear-history` (pre-push) — no merge commits among the commits being pushed; where it
  is listed, the sync also sets `pull.rebase=true` in the repo's git config.

The Built-in checks take no settings: a project that wants a fixed list of commit types or
other AI identities adds its own command. `.harness.json` names its JSON schema in `$schema`,
so editors check it; the sync checks it too. The schema is published from this repo:
`https://raw.githubusercontent.com/andrewmolyuk/harness/main/plugins/am/harness.schema.json`

## Considered options

- Config in `.claude/settings.json` — Git hooks run for commits made without Claude, and
  Claude Code owns that file's schema.
- Config in `.about/` — that folder is project knowledge (ADR 0002), not configuration.
- Hooks that call a runner in `${CLAUDE_PLUGIN_ROOT}` — the path changes with every plugin
  version and doesn't exist for anyone without the plugin.
- Settings on Built-in checks (commit types, AI identities) — an extra command covers them
  without growing the config.
- Only lowercase standard types (`feat`, `fix`, `docs`…), as ADR 0005 had it — stricter than
  the spec, which allows any type and any case; a check named after a spec follows it.
- Built-in checks always on for their hook — linear history doesn't suit every project, so
  every check is listed explicitly.
- A committed `core.hooksPath` folder, or husky, lefthook or pre-commit — no single file to
  configure the Built-in checks from.

## Consequences

- The sync writes only files marked `# managed by am`; an existing hook it didn't write is
  left alone and reported.
- The Built-in checks are TypeScript run with `bun` (ADR 0003); without `bun` they are skipped.
- Local hooks can be skipped (`--no-verify`, a clone without the plugin): the guard stops
  Claude from skipping them (ADR 0004); server-side rules such as required linear history are
  the real enforcement.
- A teammate who clones the repo without the plugin gets no Git hooks; accepted, since these
  are mostly one person's projects.
- The schema URL ties `.harness.json` to this repo's path and default branch, and needs the
  repo to be public.

