@README.md

## Map

- `.claude-plugin/marketplace.json` — the marketplace catalog.
- `plugins/am/skills/<skill>/` — `SKILL.md` is the behaviour, loaded when the skill runs;
  `format.md`, if present, is a file format, read only when writing; a `.ts` script, if present,
  is one the skill runs, with its test beside it.
- `plugins/am/hooks/` — `hooks.json`, the hook scripts it runs, and the steps
  `session-start.ts` runs in order.
- `plugins/am/githooks/` — Built-in checks, copied into a project's Git hooks folder: they
  import nothing from the plugin.
- `plugins/am/guidelines/` — the Guidelines: `index.md`, printed at session start, and the
  Guideline files it names.
- `plugins/am/statusline/` — the Status line script the Sync points Claude Code at.
- `plugins/am/lib/` — code shared by hooks and the Status line, and the preload `bunfig.toml`
  runs before every test.
- `plugins/am/harness.schema.json` — the schema of a project's `.harness.json`.
- `.about/` — this repo's own glossary and ADRs, written with these skills. Read them before
  changing a skill's vocabulary or structure.

## Verify

- Run both `claude plugin validate` commands and `bun run check` (types and tests) after every
  change.
- Markdown and TypeScript lines stay within 100 characters (frontmatter `description`
  excepted), with no trailing spaces; `lines.test.ts` checks them.
- After a change and its checks pass, run `am:tidy` on the changed files, then `am:glossary`
  and `am:adr`, yourself, before reporting it done; report "nothing new" rather than leaving
  them to the user.
- A session loads skill text at startup: try an edited skill in a new `--plugin-dir` session.

## Rules

- Skill text uses the terms defined in `.about/glossary.md` (Term, Entry, Context, Trailer, ADR,
  Status…). A new or changed term goes there first.
- The repo's own docs capitalise a term as the glossary does (the Guard, the Status line).
  Manifests, the schema and hook output keep plain words: their readers don't have the glossary.
- Skills are independent: no links or references between them.
- `README.md` is for people new to the project: short sections and bullets, not the dense
  style of skill text.
- Keep skills short. Every line loads with the skill; cut what doesn't change behaviour.
- Hooks are TypeScript run with `bun`, each with a `<hook>.test.ts` beside it. A hook that acts
  on the project does only what its Harness config key, or the key's default, asks (ADR 0011);
  the value the plugin writes for a new key changes nothing (ADR 0016). A hook that only blocks
  runs everywhere. Either quietly does nothing when a tool it needs is missing.
- Commits follow Conventional Commits (`feat:`, `docs:`, `feat(adr):`), with no `Co-Authored-By`
  line.
