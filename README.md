# harness

Claude Code plugin marketplace. Its `am` plugin has three skills: `glossary` and `adr` keep a
project's domain glossary and ADRs in `.about/`; `tidy` rechecks files for consistency,
duplicates and wordiness. In a project that already has `.about/`, the session review hook
records what each finished conversation settled, with `glossary` and `adr` in the background.
In every project, the guard hook blocks destructive git and shell commands (`git push --force`,
`git reset --hard`, `rm -rf /`…) and commands that skip Git hooks (`--no-verify`), and leaves
them to the user. In a project with `.harness.json`, the sync hook generates the Git hooks it
lists at session start. All hooks need `bun`.

`.harness.json` configures both. The guard can block more commands but never fewer; each Git
hook runs its entries in order, Built-in checks (`am:…`) or shell commands, until one fails:

```json
{
  "guard": { "block": [{ "pattern": "\\bterraform destroy\\b", "reason": "destroys infra" }] },
  "gitHooks": {
    "commit-msg": ["am:conventional-commits", "am:no-ai-coauthor"],
    "pre-commit": ["am:adr-immutable", "bun run check"],
    "pre-push": ["am:linear-history"]
  }
}
```

The Git hooks go into `.git/hooks`, marked as the plugin's own; a Git hook already there is
left alone. `am:linear-history` also sets `pull.rebase=true`. For editor checks, set `$schema`
to `https://raw.githubusercontent.com/andrewmolyuk/harness/main/plugins/am/harness.schema.json`.

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
