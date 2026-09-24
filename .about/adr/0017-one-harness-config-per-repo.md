# One Harness config per repo, at its root

Status: superseded by 0018
Date: 2026-09-24

Every `am` hook and the Status line read `.harness.json` from the root of the git repo the
session is in, not from the folder Claude Code started in; outside a repo, from that folder.
ADR 0016 creates it there, so a session started in `repo/app/` reads the file that was created
for it. A monorepo has one Harness config for all its projects.

## Considered options

- One per Claude project, in `CLAUDE_PROJECT_DIR`, as the hooks read it before — lets each
  subproject of a monorepo differ, but the Git hooks are one set per repo whichever
  subproject's config generated them, so two configs would fight over them.

## Consequences

- A `.harness.json` in a subfolder is ignored; move it to the repo root.
- Each read runs `git rev-parse --show-toplevel`, the Guard's on every tool call among them.
- The Status line's settings still go in the project's `.claude/settings.local.json`, and the
  Session review still looks for `.about/` in the project folder: both are Claude Code's, per
  project.
- A git worktree has its own root, so its own config unless `.harness.json` is committed.
