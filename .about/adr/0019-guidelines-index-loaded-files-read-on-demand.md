# Guidelines: an index loaded at session start, files read on demand

Status: accepted
Date: 2026-09-24

A plugin's own CLAUDE.md is never loaded, so the `am` plugin ships its working rules as
Guidelines in `plugins/am/guidelines/`: a SessionStart hook prints `index.md` into Claude's
context, with `${CLAUDE_PLUGIN_ROOT}` replaced by the plugin's path, and the index names each
Guideline file for Claude to read when a task calls for it. It runs only where the Harness
config has `"guidelines": true` (ADR 0011); the config is created with `false` (ADR 0016).

## Considered options

- Print every file whole — every session pays for rules most tasks never need.
- A skill per file — loads only when its description matches, so the rules that must hold on
  every task could go unseen.
- `@path` imports in the index — Claude Code expands them only in the CLAUDE.md files it loads
  itself, not in hook output.
- Keep them in the user's global CLAUDE.md — only that user gets them, not the plugin's users.

## Consequences

- Whether a Guideline file is read is Claude's call; a rule that must always hold goes in the
  index.
- The files sit outside the project, under the plugin's install folder, so reading one may ask
  for permission.
- What the ADR skill covers (recording decisions, their reversibility) stays out of the
  Guidelines.
