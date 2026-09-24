# A Retro reads transcripts only through the condenser

Status: accepted
Date: 2026-09-24

A transcript keeps every tool call's full output, so it can hold a Secret the Guard missed (ADR
0013). The `retro` skill reads transcripts only through its condenser, `condense.ts`, which
masks anything shaped like a Secret, and checks one moment with `--around <line>` rather than
reading the raw file, so a Retro doesn't Leak that Secret into one more context.

## Considered options

- Reading the raw transcript with an offset and limit, as the skill first said — the Secret
  was in a context once already, but it would spread to the Retro's context and transcript.
- The Guard also blocking reads of `~/.claude/projects/**/*.jsonl` — the Guard runs everywhere
  and can't be loosened (ADR 0004), so it would stop every other look into a transcript too.

## Consequences

- It rests on the skill's text: nothing stops Claude reading a raw transcript anyway.
- The mask goes by shape: a password without digits, or a short token, still shows.
- A token-like string that isn't a Secret (a long id) is masked too.
