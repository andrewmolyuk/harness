# harness

Claude Code plugin marketplace. Its `am` plugin has five [skills](#skills) and the hooks below.
In a repo that already has `.about/` at its root, or sets `"sessionReview": true`, the Session
review hook records what each finished conversation settled, with `glossary` and `adr` in the
background; `"sessionReview": false` turns it off. In every project, the Guard hook blocks
destructive git and shell commands (`git push --force`, `git reset --hard`, `rm -rf /`…),
commands that skip Git hooks (`--no-verify`), and tool calls that would Leak a Secret into
Claude's context (`cat .env`, `printenv`, reading `~/.ssh/id_*`, `gh auth token`…), and leaves
them to the user. At session start, a hook creates `.harness.json` at the repo root with every
setting off, or adds the keys an existing one lacks without changing its values, and the Sync
hooks generate the Git hooks it lists and, with `statusLine` on, install the plugin's Status
line (branch, file counts, context and rate-limit usage) in `.claude/settings.local.json`. With
`"guidelines": true`, a hook adds the plugin's Guidelines to Claude's context at session start:
a short index, `plugins/am/guidelines/index.md`, that names the Guideline files Claude reads
when a task calls for one (`principles.md`); reading one may ask for permission, as they sit in
the plugin's folder. All hooks need `bun`.

`.harness.json` configures them; switch a hook on by changing its value. The Guard can block
more commands but never fewer; each Git hook runs its entries in order, Built-in checks
(`am:…`) or shell commands, until one fails; `statusLine` is `true` or, to change where its
bars turn yellow and red, the percentages for `context` (10, 15 by default), `fiveHour` (50, 80)
and `sevenDay` (80, 95):

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

The Git hooks go into the repo's Git hooks folder, marked as the plugin's own; a Git hook
already there is left alone. `am:linear-history` also sets `pull.rebase=true`. `am:no-secrets`
stops a commit that adds an API key, token, private key or Env file, naming where, not what;
`am:allow-secret` on a line lets a false alarm through, and on an Env file's first line, the
file. The `.harness.json` the plugin creates points `$schema` at
`https://raw.githubusercontent.com/andrewmolyuk/harness/main/plugins/am/harness.schema.json`,
which describes every option, so editors check the file and complete the options it leaves out.

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
says where the plugin loads: `user`, the default, in every project; `project` in this one
(`.claude/settings.json`, committed); `local` in this one, only for you
(`.claude/settings.local.json`). Inside a session, `/plugin` asks for the scope. Restart the
session to load it.

Only for you, in this project, install with `--scope local` instead:

```
claude plugin install am@harness --scope local
```

For the whole team, commit both the marketplace and the plugin in the project's
`.claude/settings.json`; whoever opens the project and trusts its folder is asked to install
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

or `/plugin marketplace update harness` inside a session, then restart the session; `/plugin`
shows the installed version. It is the same whatever the scope.

## Develop

```
bun install
claude --plugin-dir ./plugins/am
claude plugin validate .
claude plugin validate plugins/am
bun run check
```

Bump `version` in `plugin.json` after changes, or installed copies won't update.
