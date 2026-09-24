# The Session review doesn't mask what it reads

Status: accepted
Date: 2026-09-24

ADR 0014 keeps a Retro from reading raw transcripts so it doesn't Leak a Secret into one more
context. The Session review also reads the raw transcript, but hands the headless session only
user and assistant text, unmasked: it drops every tool result, where a missed Secret usually
sits, and the headless session's transcript stays on the same machine and account.

## Considered options

- Mask it too: move `mask` from `condense.ts` to `lib/` for the hook to import, about ten lines;
  the rule would then cover every transcript `am` reads, superseding ADR 0014.

## Consequences

- A Secret the user pasted into a prompt, or Claude repeated in a reply, reaches the headless
  session and its transcript.
- Revisit if the Session review ever keeps tool results.
