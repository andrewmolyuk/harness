# harness glossary

Claude Code plugins that help a project keep its domain language and decisions explicit and its
files consistent: a glossary of terms, a log of ADRs, and a tidy-up check.

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

## Decisions

**Decision**:
A choice about a rule, boundary, ownership, integration or technology that constrains later
work.

**ADR**:
The written record of a Decision that is hard to reverse, not obvious without an explanation,
and a real trade-off.
_Avoid_: decision record, design doc

**Status**:
An ADR's stage: proposed (still open, editable), accepted (decided, immutable) or superseded
(replaced by a later ADR).

**Supersede**:
To replace an accepted ADR with a new one; the old one changes only its Status.

## Probing

**Finding**:
A contradiction or an unanswered case uncovered while probing; it is recorded, never papered
over.
_Avoid_: find
