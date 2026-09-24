# harness glossary

Claude Code plugins that help a project keep its domain language and decisions explicit and its
files consistent (a glossary of terms, a log of ADRs, a tidy-up pass, the Session review),
settle a plan in an Interview, find the cause of a Bug before fixing it, find Deepenings in its
code, learn from past sessions in a Retro, sync its Git hooks, show a Status line, load its
Guidelines, and guard it against destructive commands and Leaks.

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

**Harness**:
What shapes how Claude works in a project and its user can change for good: the project's
CLAUDE.md, Harness config, settings, skills and hooks, the plugins it uses, and the user's own
global CLAUDE.md and settings. Claude Code and the model aren't part of it, nor is a permission
granted for one session. `harness`, in code font, is this repo, which supplies parts of one.
_Avoid_: setup; environment, which here means environment settings (an Env file)

**Harness config**:
The repo's `.harness.json`: its settings for the `am` hooks — extra commands for the Guard
to block, the Git hooks to generate, whether to install the Status line and its Thresholds,
whether to load the Guidelines, and whether to run the Session review. The plugin creates it
in every repo, and adds the keys it lacks, each at a value that changes nothing; a project
switches on the Status line, Git hooks and Guidelines by changing a value.
_Avoid_: harness file, settings
_In code_: `config.ts` reads and checks it (`readConfig`), `harness-config.ts` creates and
completes it

**Project folder**:
The folder Claude Code starts a session in, where its per-project files such as
`.claude/settings.local.json` live. It is the repo root or a folder below it, never the working
directory a session moves to.
_Avoid_: session's folder, "the folder Claude Code started in"; "project root", which means
the repo root
_In code_: `CLAUDE_PROJECT_DIR`, `project`

**Git hook**:
A script git runs at a point in its own workflow (`pre-commit`, `commit-msg`, `pre-push`),
for every commit or push, whether or not Claude made it.
_Avoid_: "hook" alone, which here means a Claude Code hook

**Guard**:
The `am` plugin's Claude Code hook that denies a tool call before it runs when it would destroy
work, skip the Git hooks or Leak a Secret into Claude's context, and leaves it to the user; the
Harness config can add blocks to its built-in rules, never lift one.
_Avoid_: blocker, firewall

**Sync**:
The `am` plugin's steps that, at session start, bring a repo's Git hooks and Status line in line
with the Harness config, touching only what they marked as their own.
_In code_: `git-hooks.ts`, `status-line.ts`, run by `session-start.ts`

**Status line**:
The line Claude Code shows under the prompt; the `am` plugin ships its own, which the Sync
installs in a project whose Harness config asks for it.
_Avoid_: "status" alone, which is an ADR's Status
_In code_: `statusline.ts`

**Usage bar**:
One of the Status line's three meters of how much is used: the context window, and the 5-hour
and 7-day rate limits.
_Avoid_: meter, gauge

**Threshold**:
The percentage from which a Usage bar shows a colour; each bar has a yellow and a red one.

**Session review**:
The `am` plugin's Claude Code hook that, when a session ends in a repo whose Harness config
asks for it (by default, one with `.about/` at its root), has a separate headless session
record in the glossary and ADRs what the conversation settled.
_Avoid_: session-end review

**Guidelines**:
Working rules the `am` plugin ships and adds to Claude's context at session start where the
Harness config asks for them: a short index, always there, that names the Guideline files
Claude reads when a task calls for one.
_Avoid_: knowledge, which here is a project's own glossary and ADRs in `.about/`; rules (alone);
"CLAUDE.md", which Claude Code loads itself
_In code_: `guidelines.ts`, `guidelines/`

**Guideline file**:
One of the Guidelines' files beyond the index, which names each; Claude reads it when a task
calls for it, never at session start.

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

**Interview**:
Questioning the user about a plan, a few questions a round, until every Decision it depends on
is settled or knowingly left to be settled while building it; facts are looked up, never asked.
_Avoid_: grilling, questionnaire

## Diagnosing

**Bug**:
Behaviour that differs from what the code, its docs or tests promise, or from what it used to
do: wrong output, a crash, a failing or flaky test, a slowdown. One symptom is one Bug, however
many causes it has; anything never promised is a missing feature.
_Avoid_: issue, defect

**Feedback loop**:
One command that goes red on a Bug's exact symptom and green once it is fixed; for a flaky
Bug, red often enough to debug.
_Avoid_: repro

**Hypothesis**:
A possible cause of a Bug, stated with the prediction that would prove it wrong.
_Avoid_: theory, guess

**Experiment**:
One change or observation that checks a Hypothesis's prediction, with everything else held
fixed.
_Avoid_: probe, which is questioning a term, a Decision or a plan

## Architecture

**Module**:
Anything with an Interface: a function, a class, a package, a service.
_Avoid_: component, unit; "module" for a Context

**Interface**:
All a caller must know to use a Module: its types, and also the order of calls, the errors,
the limits and the config.
_Avoid_: API, signature, which name only the types

**Seam**:
Where a Module's Interface sits: the public boundary callers and tests go through, so a test
observes behaviour without reaching inside the code; not a place to swap behaviour for a test.

**Shallow module**:
A Module whose Interface is nearly as big as the code behind it; it hides little, and its
callers would lose nothing without it.
_Avoid_: thin module

**Deepening**:
A change that puts more behaviour behind fewer, smaller Interfaces: folding a Shallow module
into its callers or neighbours, merging Modules that always change together behind one, or
moving logic every caller repeats behind the Interface they call. Its tests move to the new
Interface.
_Avoid_: refactor, which is any change of structure

## Retro

**Retro**:
A review the user asks for of how past sessions went: their Stalls, and what change to the
Harness would have prevented each. Unlike the Session review, it looks at the work, not at what
was settled.
_Avoid_: retrospective, post-mortem

**Stall**:
A point in a session that cost the user something the Harness could have spared: a failed or
refused tool call, an interrupt, a correction, a prompt the user had to type again or types by
hand every time. A failure that is part of the work (a red test mid-change), a block that was
right, or a prompt that is the user's own call each time ("commit it") isn't one.
_Avoid_: finding, which is a result of probing; friction, snag

## Secrets

**Secret**:
A value that grants access: an API key, token, password or private key. A placeholder, a
published example or a key meant to be public (a Stripe publishable key, a Firebase web key)
isn't one, even where a check can't tell the difference. An Env file counts as holding Secrets
unless its first line says it holds none.
_Avoid_: credential, key (alone)

**Env file**:
A file of environment settings a program or shell loads: `.env`, `.env.local`, `prod.env`,
direnv's `.envrc`… A template of one (`.env.example`, `.sample`, `.template`, `.dist`) isn't one.
_In code_: `isEnvFile`

**Leak**:
A Secret reaching anyone or anywhere it wasn't meant for: a commit, Claude's context, another
host.

## Retired terms

- **File count** — the Status line no longer tallies changed files (S, U, A, M, D); it shows
  the branch alone.
