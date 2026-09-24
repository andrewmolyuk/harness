---
name: retro
description: Review how past sessions went and recommend changes to the project's setup that would have prevented the trouble — when the user asks for a retro, what went wrong in a session, or how to improve the harness, hooks or CLAUDE.md from experience. Condenses the transcripts, ranks stalls by cost, and changes only what the user picks. Not for recording terms or decisions.
---

# Retro

Look at how the work went, not at what it produced. Every stall cost the user something; the
fix belongs in the project's setup, so the next session doesn't pay it again.

## Read

From the project root, run `bun <this skill's base directory>/condense.ts`: no argument for the
latest session (the current one, if it is running), `--last <n>` for more, or session ids. Read
its output in full: prompts, commands, interrupts and failed tool calls with their `[line]`,
repeated calls, and for several sessions a summary of failures by kind and repeated prompts.
To check one moment, Read the raw transcript (`~/.claude/projects/<project>/<id>.jsonl`) with
an offset and limit around its line; never read it whole.

Then read what a fix would touch: CLAUDE.md, the Harness config, `.claude/settings.json`, the
hooks and skills involved. A fix that already exists but is unwired or broken is the thing to
report, not a new one.

## Look for

- **Refused calls** (`classifier`, `permission`, `rejected`): the rule or mode that would have
  let a safe call through, or the reason it should never have been tried.
- **Failed commands** (`exit`): a real failure, or a misused tool or shell (a glob with no
  match, `=word` in zsh, a wrong path)? Misuse that recurs needs an instruction or a check.
- **Guard blocks** (`guard`): a real danger, or a false alarm — a Bug in the Guard.
- **Interrupts and corrections**: what Claude did that the user stopped or redirected, and what
  would have told it beforehand.
- **Repeated prompts**: work the user keeps asking for by hand — a skill, a hook or a Git hook.
- **Repeated calls**: Claude hunting for the same thing — a pointer in CLAUDE.md.

Rank by cost: how often it happened, times what it cost the user (a retry, a mode switch, a
wrong turn undone). Mention a one-off only if it was severe.

## Fix where it holds

Prefer the fix that works without Claude remembering it:
1. **Enforced**: a Guard block or Git hook in the Harness config, a check, a test.
2. **Configured**: a permission rule or setting.
3. **Written**: the shortest line that changes behaviour — in CLAUDE.md for this project,
   `~/.claude/CLAUDE.md` for every project, or a skill. Cut an instruction the transcripts show
   had no effect.

Say where each fix lives: this project, a plugin it uses, or Claude Code itself — for that last
one, a report to send, not a change to make.

## Report

A ranked list; for each: what happened (session, `[line]`, how often), what it cost, the fix
(which file, what change). Ask which to apply, apply only those, and run the project's checks.
Don't commit. Replace secrets you quote with `*****`.
