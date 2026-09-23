# The guard hook runs in every project; project config only tightens it

Status: accepted
Date: 2026-09-24

The `am` plugin's guard hook blocks destructive git and shell commands, and commands that skip
the Git hooks (`--no-verify`), in every project, with no opt-in, and leaves them to the user to
run. A project's `.harness.json` can add blocks (a regex on the command text and a reason) but
never lift a built-in one: Claude can edit that file, and a cloned repo brings its own, so a
setting that loosens the guard would let either disarm it. A hook that only blocks changes
nothing in the project, so running everywhere fits ADR 0001; a hook that acts on the project
still runs only where the project opted in (has `.about/` or `.harness.json`).

## Considered options

- Opt-in per project, like the session-end review hook — a guard that has to be switched on
  protects nothing in the projects where nobody did, and blocking changes nothing, so there is
  nothing to opt in to.
- Project config that turns built-in rules off by id, with the guard asking before Claude edits
  `.harness.json` — rejected: more to build, and a cloned repo's config would still apply.
- Extra blocks as command prefixes (`kubectl delete`) — safer against quoting, but less
  expressive than a regex.

## Consequences

- Every project with `am` installed gets the guard; the only way out is to uninstall the plugin
  or not have `bun`. A command the guard wrongly blocks is left to the user.
- Removing an entry from `.harness.json` is still possible for Claude; the built-in rules are
  the floor.
- It matches command text, not a full shell parse: a safety net against mistakes, not a sandbox.
