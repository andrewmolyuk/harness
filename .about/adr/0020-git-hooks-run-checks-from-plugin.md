# Git hooks run the Built-in checks from the plugin, not a copy

Status: accepted
Date: 2026-09-25

As ADR 0007 has it, except the generated Git hooks run each Built-in check from the plugin
version that generated them, by absolute path, instead of a copy in the hooks folder's `am/`.
Every session start rewrites that path, so the hooks follow each plugin update without a second
copy of the checks to keep in step or clean up. The Sync removes the copies earlier versions left.

## Considered options

- A copy of the Built-in checks in the hooks folder's `am/` (ADR 0007) — hooks outlive the
  plugin, but the copies stayed behind once `gitHooks` stopped listing them, and every check was
  copied whichever were listed. Surviving the plugin adds little: without it nothing updates
  them, and a teammate without the plugin has no hooks either way.
- `${CLAUDE_PLUGIN_ROOT}` in the hook — git runs hooks without Claude Code's environment.

## Consequences

- Between a plugin update or removal and the next session start, a Built-in check whose file is
  gone is skipped with a warning, as without `bun`; shell command entries still run.
- The Built-in checks may import from the plugin; they're no longer copied alone.
