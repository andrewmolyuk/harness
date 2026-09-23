# harness

Claude Code plugin marketplace. Its `am` plugin has three skills: `glossary` and `adr` keep a
project's domain glossary and ADRs in `.about/`; `tidy` rechecks files for consistency,
duplicates and wordiness.

## Install

```
/plugin marketplace add <path-or-git-url>
/plugin install am@harness
```

## Develop

```
claude --plugin-dir ./plugins/am
claude plugin validate .
claude plugin validate plugins/am
```

Bump `version` in `plugin.json` after changes, or installed copies won't update.
