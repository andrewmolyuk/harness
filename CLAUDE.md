@README.md

## Map

- `.claude-plugin/marketplace.json` — the marketplace catalog.
- `plugins/am/skills/<skill>/` — `SKILL.md` is the behaviour, loaded when the skill runs;
  `format.md` is the file format, read only when writing.
- `.about/` — this repo's own glossary and ADRs, written with these skills. Read them before
  changing a skill's vocabulary or structure.

## Verify

- Run both `claude plugin validate` commands after every change.
- Markdown lines stay within 100 characters (frontmatter `description` excepted), with no
  trailing spaces.
- A session loads skill text at startup: try an edited skill in a new `--plugin-dir` session.

## Rules

- Skill text uses the terms defined in `.about/glossary.md` (Term, Entry, Context, Trailer, ADR,
  Status…). A new or changed term goes there first.
- Skills are independent: no links or references between `glossary` and `adr`.
- Keep skills short. Every line loads with the skill; cut what doesn't change behaviour.
- Commits follow Conventional Commits (`feat:`, `docs:`, `feat(adr):`), with no `Co-Authored-By`
  line.
