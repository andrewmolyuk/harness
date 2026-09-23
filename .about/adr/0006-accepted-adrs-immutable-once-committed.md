# Accepted ADRs are immutable once committed

Status: accepted
Date: 2026-09-24

A Built-in check, `am:adr-immutable` (pre-commit), enforces that an ADR is immutable once
committed as accepted: comparing the staged files with `HEAD`, it fails when a file under
`.about/adr/` that was accepted or superseded is deleted, renamed or edited. The one edit it
allows is superseding an accepted ADR: only its Status (to `superseded by <number>`, an ADR
that exists) and Date change. A Git hook checks the result however the file was changed, by
Claude or by hand; like every Built-in check, a project turns it on by listing it (ADR 0005).

## Considered options

- Compare with the upstream branch, so an accepted ADR stays editable until pushed — rejected:
  a commit is where "accepted" becomes a record, and pushing is not a step every project has.
- A PreToolUse hook on Claude's file edits — Bash (`sed -i`, `cat >`) goes around it, and it
  misses edits made without Claude.

## Consequences

- A typo in a committed accepted ADR stays, or is fixed by a superseding ADR;
  `git commit --amend` can't change it either.
