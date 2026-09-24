# The Harness config and `.about/` sit together at the repo root

Status: accepted
Date: 2026-09-24

`.harness.json` and `.about/` are siblings at the root of the git repo the session is in,
whatever its Project folder; outside a repo, both are in the Project folder. Every `am` hook
and the Status line read the Harness config there, the Session review looks for `.about/`
there and runs its review from there, and the `glossary` and `adr` skills write there. A
monorepo has one Harness config, one glossary with a Context per project, and one ADR log.
This replaces ADR 0017, which left `.about/` in the Project folder.

## Considered options

- Both in the Project folder — each project of a monorepo gets its own, but their configs
  fight over the repo's one set of Git hooks, and where the files land depends on how the
  session was opened.
- The config at the root and `.about/` per project, as ADR 0017 had it — the two drift apart,
  and a session in a subfolder never gets its Session review.

## Consequences

- A `.harness.json` or `.about/` in a subfolder is ignored; move it to the repo root.
- Each config read runs `git rev-parse --show-toplevel`, the Guard's on every tool call among
  them.
- The Status line's settings still go in the Project folder's `.claude/settings.local.json`:
  that file is Claude Code's, per project.
- A git worktree or a submodule has its own root, so its own config and `.about/` unless they
  are committed.
