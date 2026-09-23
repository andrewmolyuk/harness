# harness

Claude Code plugin marketplace. Its `am` plugin has three skills: `glossary` and `adr` keep a
project's domain glossary and ADRs in `.about/`; `tidy` rechecks files for consistency,
duplicates and wordiness. In a project that already has `.about/`, a session-end hook reviews
each finished conversation with `glossary` and `adr` in the background. In every project, a
guard hook blocks destructive git and shell commands (`git push --force`, `git reset --hard`,
`rm -rf /`…) and commands that skip git hooks (`--no-verify`), and leaves them to the user.
Both hooks need `bun`.

A project can block more commands in `.harness.json`; it can't unblock the built-in ones:

```json
{ "guard": { "block": [{ "pattern": "\\bterraform destroy\\b", "reason": "destroys infra" }] } }
```

## Install

```
/plugin marketplace add <path-or-git-url>
/plugin install am@harness
```

## Develop

```
bun install
claude --plugin-dir ./plugins/am
claude plugin validate .
claude plugin validate plugins/am
bun run check
```

Bump `version` in `plugin.json` after changes, or installed copies won't update.
