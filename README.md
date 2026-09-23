# harness

Claude Code plugin marketplace. The `am` plugin keeps a project's domain glossary and ADRs in
`.about/` (skills `glossary` and `adr`).

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
