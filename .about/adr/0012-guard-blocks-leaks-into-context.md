# The Guard also blocks Leaks into Claude's context

Status: superseded by 0013
Date: 2026-09-24

Besides destructive and hook-skipping commands, the Guard denies a tool call that would Leak a
Secret into Claude's context: showing an env file, a private key or a file of Secrets (with
Bash, Read or Grep), dumping the environment or echoing a variable named like a Secret, and
commands that print a stored Secret (`gh auth token`, `security … -w`). It stays one hook that
runs everywhere and that the Harness config can only tighten (ADR 0004). A blocked Leak is left
to the user in their own terminal, not with `!`, whose output enters the session. An env file
with `am:allow-secret` on its first line is readable, the same rule as `am:no-secrets`.

## Considered options

- A separate hook for Leaks — the same shape as the Guard twice over, and one more Term.
- Suggesting `! <command>`, as for the Guard's other blocks — the output lands in the session,
  which is the Leak itself.
- Every env file off limits, marked or not — simpler, but a project's committed defaults would
  pass `am:no-secrets` and still be hidden from Claude.
- Blocking a Secret sent to another host (`curl -d "$TOKEN"`) — a legitimate API call looks the
  same.

## Consequences

- The Guard now also runs on every Read and Grep call, starting `bun` each time.
- It matches known files, commands and variable names: a Secret written into source code, or
  read by a script (`python -c …`), still reaches the context.
- Claude can't inspect an unmarked env file while debugging; the user looks instead.
- A public certificate named `*.pem` is blocked along with private keys.
