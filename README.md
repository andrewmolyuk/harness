# harness

I'm Andrew Molyuk, and this is my personal project: the parts of my own Claude Code Harness
(skills, hooks, Git hooks, Guidelines, a Status line) that I use every day in most of my pet
projects. It's shaped by my own habits and published as is; take what fits yours.

It's a Claude Code plugin marketplace with one plugin, `am`: five [skills](#skills) and the
[hooks](#hooks) below, set up per project in [`.harness.json`](#configuration).

## Skills

Claude picks a skill when the conversation calls for it; `/am:<skill>` runs it by hand.

- **`glossary`** — sharpens the project's domain vocabulary while you design. It challenges new
  or vague Terms against `.about/glossary.md`, tests them with borderline cases and the code,
  and records each Entry as it settles.
- **`adr`** — challenges and records Decisions: business rules, boundaries, integrations,
  technology choices. It calls out a proposal that contradicts an earlier ADR, probes the
  alternatives and cost, and writes `.about/adr/NNNN-slug.md` when a decision is hard to
  reverse, not obvious and a real trade-off.
- **`tidy`** — rechecks files as a set for consistency, duplicates and wordiness. It runs the
  project's own checks, fixes what is clear and asks about the rest.
- **`diagnose`** — finds a Bug's cause before fixing it. It builds a Feedback loop that
  reproduces the exact symptom, shrinks it, runs an Experiment on each ranked Hypothesis, and
  locks the fix in with a regression test.
- **`retro`** — reads past session transcripts, through a condenser that masks Secrets, for
  Stalls: refused calls, failed commands, interrupts, repeated prompts. It ranks them by cost
  and recommends the Harness changes that would have prevented them, applying only those you
  pick.

## Hooks

All hooks need `bun`; without it they do nothing.

- **Guard** — runs in every project. It blocks commands that destroy work (`git push --force`,
  `git reset --hard`, `rm -rf /`…) or skip Git hooks (`--no-verify`). It also blocks tool calls
  that would Leak a Secret into Claude's context (`cat .env`, `printenv`, reading
  `~/.ssh/id_*`, `gh auth token`…). A blocked command is left for you to run.
- **`.harness.json`** — at session start, creates the file at the repo root with every setting
  off. If the file exists, it adds any missing keys and leaves your values alone.
- **Sync** — at session start, generates the Git hooks `.harness.json` lists. With
  `statusLine` on, it also installs the plugin's Status line (branch, file counts, context and
  rate-limit usage) in `.claude/settings.local.json`.
- **Guidelines** — at session start, with `"guidelines": true`, adds a short index,
  `plugins/am/guidelines/index.md`, to Claude's context. The index names the Guideline files,
  such as `principles.md`, that Claude reads when a task calls for one. Reading one may ask for
  permission, since the files are in the plugin's folder.
- **Session review** — when a conversation ends, records what it settled, using `glossary` and
  `adr` in the background. It runs in a repo with `.about/` at its root, or with
  `"sessionReview": true`; `"sessionReview": false` turns it off.

## Configuration

`.harness.json` at the repo root sets up the hooks. Each setting the plugin writes starts off;
switch one on by changing its value:

- **`guard`** — extra commands to block. The Guard can block more commands, never fewer.
- **`gitHooks`** — the Git hooks to generate. Each runs its entries in order, Built-in checks
  (`am:…`) or shell commands, until one fails.
- **`statusLine`** — `true`, or the percentages where its bars turn yellow and red: `context`
  (10, 15 by default), `fiveHour` (50, 80) and `sevenDay` (80, 95).
- **`guidelines`** — `true` loads the Guidelines.
- **`sessionReview`** — `true` or `false`; left out, it follows whether `.about/` exists.

```json
{
  "guard": { "block": [{ "pattern": "\\bterraform destroy\\b", "reason": "destroys infra" }] },
  "statusLine": { "context": { "yellow": 20, "red": 40 } },
  "sessionReview": false,
  "guidelines": true,
  "gitHooks": {
    "commit-msg": ["am:conventional-commits", "am:no-ai-coauthor"],
    "pre-commit": ["am:adr-immutable", "am:no-secrets", "bun run check"],
    "pre-push": ["am:linear-history"]
  }
}
```

The Git hooks go into the repo's Git hooks folder, marked as the plugin's own. A Git hook
already there is left alone. `am:linear-history` also sets `pull.rebase=true`.

`am:no-secrets` stops a commit that adds an API key, token, private key or Env file, naming
where, not what. To let a false alarm through, put `am:allow-secret` on the line; on an Env
file's first line, it lets the whole file through.

The file's `$schema` points at
`https://raw.githubusercontent.com/andrewmolyuk/harness/main/plugins/am/harness.schema.json`,
which describes every option, so editors check the file and complete the options it leaves out.

## Install

From the project's folder:

```
claude plugin marketplace add andrewmolyuk/harness
claude plugin install am@harness --scope project
```

The marketplace is this GitHub repo's `main`; a local path or a git URL works too. The scope
says where the plugin loads:

- **`user`** (the default) — in every project.
- **`project`** — in this project, committed in `.claude/settings.json`.
- **`local`** — in this project, only for you, in `.claude/settings.local.json`:

  ```
  claude plugin install am@harness --scope local
  ```

Inside a session, `/plugin` asks for the scope. Restart the session to load the plugin.

For the whole team, commit both the marketplace and the plugin in the project's
`.claude/settings.json`. Whoever opens the project and trusts its folder is asked to install
them:

```json
{
  "extraKnownMarketplaces": {
    "harness": { "source": { "source": "github", "repo": "andrewmolyuk/harness" } }
  },
  "enabledPlugins": { "am@harness": true }
}
```

## Update

```
claude plugin marketplace update harness
```

Or run `/plugin marketplace update harness` inside a session. Then restart the session;
`/plugin` shows the installed version. It works the same whatever the scope.

## Develop

```
bun install
claude --plugin-dir ./plugins/am
claude plugin validate .
claude plugin validate plugins/am
bun run check
```

Bump `version` in `plugin.json` after changes, or installed copies won't update.

## License

[MIT](LICENSE.md) © 2026 Andrew Molyuk
