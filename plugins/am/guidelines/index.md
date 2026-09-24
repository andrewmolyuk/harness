# am guidelines

Working rules from the `am` plugin. The project's own CLAUDE.md wins where they conflict. For a
trivial change (a typo, a comment, an obvious one-liner), skip the ceremony and just do it.

- Touch only what the task needs and match the existing style; remove only the orphans your
  change made.
- Write the least code that solves the stated problem: nothing speculative, no options nobody
  asked for.
- Don't guess silently: state your assumptions, and ask when a request reads more than one way.
- Done is verifiable: say how someone else can check it without asking you.

Read these files when their task comes up:

- Before non-trivial work (a feature, a refactor, an architecture, API or data-model change):
  `${CLAUDE_PLUGIN_ROOT}/guidelines/principles.md`.
- Designing a module or an interface, or deciding where it is tested from:
  `${CLAUDE_PLUGIN_ROOT}/guidelines/design.md`.
- Writing tests, or building test-first: `${CLAUDE_PLUGIN_ROOT}/guidelines/testing.md`.
- Writing or editing a skill, a CLAUDE.md or AGENTS.md, or a prompt:
  `${CLAUDE_PLUGIN_ROOT}/guidelines/writing-for-agents.md`.
