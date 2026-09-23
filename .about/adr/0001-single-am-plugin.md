# One `am` plugin, addressed by its namespace

Status: accepted

All shared skills ship in a single plugin, `am`, from the `harness` marketplace, and are called
as `/am:<skill>` or just `/<skill>` when the name is unique. A short namespace keeps autocomplete
readable, one install and one version are simpler to manage, and an unused skill costs only its
description.

## Considered options

- Several plugins (`am`, `am-go`, `am-guard`, …) for selective install — one more namespace per
  plugin for little gain, since skills load only when used.
- Copying skills with an `am-` prefix into each project's `.claude/skills/` — selective and
  pinned, but updates are manual and the bare `/<skill>` name no longer applies.

## Consequences

- Every project gets every skill in the plugin. Anything that must not run everywhere (hooks,
  MCP servers) has to be opt-in or go to a separate plugin.
- Revisit when skill descriptions start crowding the context.
