# harness

Claude Code plugin marketplace. Its `am` plugin has five [skills](#skills) and the hooks below.
In a project that already has `.about/`, or sets `"sessionReview": true`, the Session review
hook records what each finished conversation settled, with `glossary` and `adr` in the
background; `"sessionReview": false` turns it off. In every project, the Guard hook blocks
destructive git and shell commands (`git push --force`, `git reset --hard`, `rm -rf /`…),
commands that skip Git hooks (`--no-verify`), and tool calls that would Leak a Secret into
Claude's context (`cat .env`, `printenv`, reading `~/.ssh/id_*`, `gh auth token`…), and leaves
them to the user. In a project with `.harness.json`, at session start, the Sync hooks generate
the Git hooks it lists and, with `statusLine` on, install the plugin's Status line (branch, file
counts, context and rate-limit usage) in `.claude/settings.local.json`. All hooks need `bun`.

`.harness.json` configures them. The Guard can block more commands but never fewer; each Git
hook runs its entries in order, Built-in checks (`am:…`) or shell commands, until one fails;
`statusLine` is `true` or, to change where its bars turn yellow and red, the percentages for
`context` (10, 15 by default), `fiveHour` (50, 80) and `sevenDay` (80, 95):

```json
{
  "guard": { "block": [{ "pattern": "\\bterraform destroy\\b", "reason": "destroys infra" }] },
  "statusLine": { "context": { "yellow": 20, "red": 40 } },
  "sessionReview": false,
  "gitHooks": {
    "commit-msg": ["am:conventional-commits", "am:no-ai-coauthor"],
    "pre-commit": ["am:adr-immutable", "am:no-secrets", "bun run check"],
    "pre-push": ["am:linear-history"]
  }
}
```

The Git hooks go into the repo's Git hooks folder, marked as the plugin's own; a Git hook
already there is left alone. `am:linear-history` also sets `pull.rebase=true`. `am:no-secrets`
stops a commit that adds an API key, token, private key or Env file, naming where, not what;
`am:allow-secret` on a line lets a false alarm through, and on an Env file's first line, the
file. For editor checks, set `$schema` to
`https://raw.githubusercontent.com/andrewmolyuk/harness/main/plugins/am/harness.schema.json`.

## Skills

Claude picks a skill when the conversation calls for it; `/am:<skill>` runs it by hand.

- **`glossary`** — sharpens the project's domain vocabulary while you design. It challenges new
  or vague Terms against `.about/glossary.md`, stress-tests them with borderline cases and the
  code, and records each Entry as it settles.
- **`adr`** — challenges and records Decisions: business rules, boundaries, integrations,
  technology choices. It calls out a proposal that contradicts an earlier ADR, probes the
  alternatives and cost, and writes `.about/adr/NNNN-slug.md` when a decision is hard to
  reverse, not obvious and a real trade-off.
- **`tidy`** — rechecks files as a set for consistency, duplicates and wordiness, runs the
  project's own checks, fixes what is clear and asks about the rest.
- **`diagnose`** — finds a Bug's cause before fixing it: builds a Feedback loop that reproduces
  the exact symptom, shrinks it, runs an Experiment on each ranked Hypothesis in turn, and locks
  the fix in with a regression test.
- **`retro`** — reads past session transcripts, through a condenser that masks Secrets, for
  Stalls (refused calls, failed commands, interrupts, repeated prompts), ranks them by cost and
  recommends the Harness changes that would have prevented them, applying only those you pick.

## Install

From the project's folder:

```
claude plugin marketplace add andrewmolyuk/harness
claude plugin install am@harness --scope project
```

The marketplace is this GitHub repo's `main`; a local path or a git URL works too. The scope
says where the plugin loads: `user`, the default, in every project; `project` in this one, for
everyone who clones it (`.claude/settings.json`, committed); `local` in this one, only for you
(`.claude/settings.local.json`). Inside a session, `/plugin` asks for the scope. Restart the
session to load it, and run `/plugin marketplace update harness` to pick up a new version.

## Develop

```
bun install
claude --plugin-dir ./plugins/am
claude plugin validate .
claude plugin validate plugins/am
bun run check
```

Bump `version` in `plugin.json` after changes, or installed copies won't update.
