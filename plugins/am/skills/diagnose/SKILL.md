---
name: diagnose
description: Find the cause of a bug (wrong output, a crash, a failing or flaky test, a slowdown) before fixing it — when something is broken, throwing, failing or slower than it was, or the user says debug or diagnose. Builds a feedback loop that reproduces the exact symptom, shrinks it, runs an experiment on each ranked hypothesis in turn, and locks the fix in with a regression test. Not for building features.
---

# Diagnose

Find the cause before you fix anything. No hypothesis until a feedback loop reproduces the bug:
reading code to guess the cause first is the failure this skill exists to stop. A bug is
behaviour that differs from what the code, its docs or tests promise, or from what it used to
do: wrong output, a crash, a failing or flaky test, a slowdown. One symptom is one bug, however
many causes it has.

Read the project's glossary and ADRs (e.g. `.about/`) for the area you touch. In every command
and output you show, replace secrets with `*****`; keep credentials in the environment.

## 1. Build a feedback loop

One command you run that goes red on this bug and green once it's fixed. Try, roughly in
order: a failing test; a request to a running server; a CLI call diffed against known-good
output; a headless browser script; a captured request or log replayed through the code path; a
throwaway harness calling the code directly; random inputs, many times over; `git bisect run`
between a good and a bad commit; the same input through the old and new version, diffed.

Then tighten it: fast (seconds), sharp (asserts the user's exact symptom, not "didn't crash"),
deterministic (pin time, seed randomness, isolate files and network). For a flaky bug, raise
the failure rate — repeat it, parallelise, add load — until it fails often enough to debug.

Done when you have run it and shown the command and its red output. If you can't build one,
stop: list what you tried and ask for access to where it fails, a captured artifact (logs, HAR,
dump) or permission to add temporary logging. A person following your steps by hand is the last
resort: give them exact steps and what to paste back.

## 2. Reproduce and shrink

Confirm it fails with the symptom the user described, not a nearby one, and on every run (a
flaky bug: often enough to debug). Then remove inputs, config, callers and steps one at a time,
re-running after each, until every part left is needed for it to fail.

## 3. Hypothesise

List 3–5 hypotheses, most likely first, each with its prediction: "If the cache key ignores the
locale, clearing the cache makes it pass." One without a prediction is a guess: sharpen it or
drop it. Show the list to the user, who may rule some out at once; don't wait if they're away.

## 4. Experiment

Run one experiment at a time: one hypothesis, one change. Prefer a debugger or REPL; otherwise
log only where the hypotheses differ, every line tagged with one prefix (`[DEBUG-a4f2]`) so
cleanup is one grep. For a slowdown, measure a baseline and bisect; logs rarely show it.

## 5. Fix

Find the seam where a test can hit the bug as it happens at the call site. Turn the shrunk
loop into a failing test there, watch it fail, fix, watch it pass, then re-run the original
loop. If no seam reaches the bug, don't write a shallow test that proves nothing: say the
design keeps this bug from being locked down.

## 6. Clean up and report

- The original loop is green; the regression test passes, or the missing seam is reported.
- No tagged debug lines left; throwaway harnesses deleted.
- Tell the user the causes and which hypotheses held, in a line or two, and put the causes in
  the commit message if you are asked to commit.
