# The Harness config switches each `am` hook by its own key; a blocking hook can't be switched off

Status: accepted
Date: 2026-09-24

The Harness config has one key per `am` hook: `guard` adds blocks, `gitHooks` and `statusLine`
drive the Sync, and `sessionReview` switches the Session review (on by default where `.about/`
exists). It has no `gitHooks`-style list of Claude Code events with `am:` entries and shell
commands: Claude Code's own `.claude/settings.json` already runs commands per event, which git
has no equivalent for, and listing the guard would let a config leave it out (ADR 0004). This
replaces ADR 0010, whose rule for new hooks let a key switch off one that only blocks.

## Considered options

- A `claudeHooks` list per event (`"PreToolUse": ["am:guard", "lint.sh"]`) — one readable place
  for everything, but the plugin's fixed `hooks.json` would have to register every event and
  re-implement matchers and each event's output, start `bun` on every event, and say twice
  what `gitHooks` and `statusLine` already switch.

## Consequences

- A project's own Claude Code hooks go in `.claude/settings.json`, not the Harness config.
- A new `am` hook that acts on the project gets its own key, off or on by a default the key can
  override. One that only blocks runs everywhere, and its key can only tighten it (ADR 0004).
