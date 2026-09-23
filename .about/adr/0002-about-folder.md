# Project knowledge lives in `.about/`

Status: accepted
Date: 2026-09-23

The skills keep a project's glossary and ADRs in `.about/glossary.md` and `.about/adr/`. This is
project knowledge for people and for any agent, so it belongs neither in one vendor's config
folder nor in a folder other tools already claim; `.about` is short, unclaimed, and sorts first.

## Considered options

- `docs/` — mixes the glossary and ADRs with general documentation.
- `.claude/` — Claude Code's own configuration; ties the knowledge to one tool.
- `.agents/` — neutral, but shared with Codex, Copilot and others, which claim parts of it.
- `.kb`, `.knowledge` — fine, but don't sort first.

## Consequences

- The folder is hidden: point to it from `AGENTS.md` or `CLAUDE.md`.
- A project with its own conventions (e.g. `CONTEXT.md`, `docs/adr/`) keeps them; the skills
  follow the project.
- Moving the default later means migrating every project that uses it.
