# harness glossary

Claude Code plugins that help a project keep its domain language and decisions explicit and its
files consistent (a glossary of terms, a log of ADRs, a tidy-up pass, the Session review), sync
its Git hooks, show a Status line, and guard it against destructive commands.

## Glossary

**Term**:
A word the project agrees to use for exactly one concept within its Context; until agreed,
it is just a word in play.

**Entry**:
A Term's record in the glossary: its definition, plus the words to avoid and optional trailers.

**Context**:
A part of the system with its own vocabulary, where the same Term can mean something else.
_Avoid_: module, domain; "context" for an agent's context window

**Topic**:
A group of related Entries under one subheading.
_Avoid_: cluster, category

**Shared term**:
A Term that means the same in every Context.

**Trailer**:
An optional line after a definition that says something about the Entry rather than the
concept (`_In code_`, `_Planned_`).
_Avoid_: marker, field, tag

**Retired term**:
A word dropped because the concept it named doesn't exist.

**Unresolved item**:
A contested name or a case the glossary can't answer yet, listed with what would settle it.

## Configuration

**Harness config**:
The project's `.harness.json`: its settings for the `am` hooks — extra commands for the guard
to block, the Git hooks to generate, and whether to install the Status line and where its bars
turn yellow and red.
_Avoid_: harness file, settings

**Git hook**:
A script git runs at a point in its own workflow (`pre-commit`, `commit-msg`, `pre-push`),
for every commit or push, whether or not Claude made it.
_Avoid_: "hook" alone, which here means a Claude Code hook

**Guard**:
The `am` plugin's Claude Code hook that denies a destructive or hook-skipping command before
Claude runs it and leaves it to the user; the Harness config can add blocks to its built-in
rules, never lift one.
_Avoid_: blocker, firewall

**Sync**:
The `am` plugin's Claude Code hooks that, at session start, bring a repo's Git hooks and Status
line in line with the Harness config, touching only what they marked as their own.
_In code_: `git-hooks.ts`, `status-line.ts`

**Status line**:
The line Claude Code shows under the prompt; the `am` plugin ships its own, which the Sync
installs in a project whose Harness config asks for it.
_Avoid_: "status" alone, which is an ADR's Status
_In code_: `statusline.ts`

**Session review**:
The `am` plugin's Claude Code hook that, when a session ends in a project with `.about/`, has a
separate headless session record in the glossary and ADRs what the conversation settled.
_Avoid_: session-end review

**Built-in check**:
A check the `am` plugin ships for one Git hook, enabled by listing it as `am:<name>` in the
Harness config.
_Avoid_: "check" for one of the Guard's built-in rules

## Decisions

**Decision**:
A choice about a rule, boundary, ownership, integration or technology that constrains later
work.

**ADR**:
The written record of a Decision that is hard to reverse, not obvious without an explanation,
and a real trade-off.
_Avoid_: decision record, design doc

**Status**:
An ADR's stage: proposed (still open, editable), accepted (decided; immutable but for a Typo
fixed in the session that wrote it, resumed or not, before it's committed) or superseded
(replaced by a later ADR).

**Supersede**:
To replace an accepted ADR with a new one; the old one changes only its Status, and the Date
with it.

**Typo**:
A slip that keeps an ADR from saying what its author meant (spelling, punctuation, formatting,
a wrong reference); fixing one never changes what was decided.

## Probing

**Finding**:
A contradiction or an unanswered case uncovered while probing; it is recorded, never papered
over.
_Avoid_: find
