@README.md

## Map

- `.claude-plugin/marketplace.json` — the marketplace catalog.
- `plugins/am/skills/<skill>/` — `SKILL.md` is the behaviour, loaded when the skill runs;
  `format.md`, if present, is a file format, read only when writing.
- `plugins/am/hooks/` — `hooks.json` and the hook scripts it runs.
- `plugins/am/githooks/` — Built-in checks, copied into a project's Git hooks folder: they
  import nothing from the plugin.
- `plugins/am/statusline/` — the status line script the sync points Claude Code at.
- `plugins/am/lib/` — code shared by hooks, and the preload `bunfig.toml` runs before every test.
- `plugins/am/harness.schema.json` — the schema of a project's `.harness.json`.
- `.about/` — this repo's own glossary and ADRs, written with these skills. Read them before
  changing a skill's vocabulary or structure.

## Verify

- Run both `claude plugin validate` commands and `bun run check` (types and tests) after every
  change.
- Markdown and TypeScript lines stay within 100 characters (frontmatter `description`
  excepted), with no trailing spaces.
- A session loads skill text at startup: try an edited skill in a new `--plugin-dir` session.

## Rules

- Skill text uses the terms defined in `.about/glossary.md` (Term, Entry, Context, Trailer, ADR,
  Status…). A new or changed term goes there first.
- Skills are independent: no links or references between them.
- Keep skills short. Every line loads with the skill; cut what doesn't change behaviour.
- Hooks are TypeScript run with `bun`, each with a `<hook>.test.ts` beside it. A hook that acts
  on the project does nothing unless the project opted in; a hook that only blocks runs
  everywhere. Either quietly does nothing when a tool it needs is missing.
- Commits follow Conventional Commits (`feat:`, `docs:`, `feat(adr):`), with no `Co-Authored-By`
  line.
