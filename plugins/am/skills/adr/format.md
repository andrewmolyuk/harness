# ADR format

`.about/adr/0001-slug.md`, `0002-slug.md`, … — the next number after the highest existing one;
keep the project's numbering style if it already has one.

```md
# {Short decision title}

Status: proposed | accepted | superseded by 0007

{1–3 sentences: the context, what was decided, and why.}
```

That is often enough. Add a section only when it earns its place:

- **Considered options** — rejected alternatives worth remembering; only ones actually discussed.
- **Consequences** — non-obvious effects, including the downsides knowingly accepted.

What typically qualifies — any kind of decision, not only architecture: domain rules and
invariants that are not obvious or costly to change; architectural shape; how contexts integrate;
technology with lock-in; ownership and scope boundaries (the explicit "no"s too); deliberate
deviations from the obvious path; constraints invisible in code (compliance, partner contracts,
SLAs); a rejected option likely to be proposed again.
