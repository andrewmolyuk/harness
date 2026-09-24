# The Harness config is created in every repo, with every setting off

Status: accepted
Date: 2026-09-24

A SessionStart hook creates `.harness.json` at the root of the git repo when it is missing, and
adds the top-level keys an existing one lacks, never changing a value or the order of the
keys. The hook running at all means the `am` plugin is enabled there, so it needs no other
opt-in. Each value it writes keeps its hook doing what it does without the key (`statusLine:
false`, `gitHooks: {}`, `guard: { block: [] }`), and `sessionReview` is left out, since its
default depends on `.about/`. So a project opts in by editing a value, not by having the file,
as ADR 0004 had it: the Sync (ADR 0007, 0009) still runs only what the Harness config lists.

## Considered options

- Create it only where `.about/` exists — a new project has no `.about/` yet.
- Create it only where the project's own `.claude/settings.json` or `settings.local.json`
  enables the plugin — excludes a user-scope install, where the plugin runs anyway.
- Write the README example, with the Status line and Git hooks on — would switch them on in
  every repo the plugin reaches.
- Merge nested keys too — would add entries inside a setting the user shaped by hand.

## Consequences

- With a user-scope install, every repo opened gets an untracked `.harness.json`.
- A file that isn't a JSON object is left alone and reported.
- A new top-level key in the schema reaches existing projects at their next session start, so
  its default must change nothing.
- Missing keys are inserted into the file's text, `$schema` first and the rest last, so the
  user's own lines stay byte for byte; a complete file is never written.
