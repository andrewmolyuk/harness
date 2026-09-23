# Hooks are TypeScript run with `bun`, each with a test

Status: accepted
Date: 2026-09-24

Every hook in the `am` plugin is a TypeScript file run with `bun`, with a `<hook>.test.ts` beside
it. Hooks run unattended on every user's machine, so they have to be typed and tested; `bun`
runs TypeScript directly, with no build step and a built-in test runner.

## Considered options

- Shell with `jq` — the usual choice and nothing to install, but untyped, hard to test, and
  fragile once a hook parses a transcript or spawns a process.
- Node — typed via a build step or a loader, but slower to start and needs a separate test
  runner.

## Consequences

- `bun` is a prerequisite: `hooks.json` runs a hook only when `bun` is on the PATH, so without it
  hooks silently do nothing.
- `bun run check` (types and tests) gates every change.
