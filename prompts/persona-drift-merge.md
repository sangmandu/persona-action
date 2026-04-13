# Level 3 — Drift Merge Prompt

You are given the **existing persona** for engineer `{{login}}` and a freshly synthesized **batch persona** covering the last 20 merged PRs. Merge them into an updated persona.

## Input
- login: `{{login}}`
- `current_persona.md` — persona_version = N
- `new_batch_persona.md` — covers the 20 most recent PRs
- New meta — persona_version = N+1, last_pr_number, updated_at, batch_count

## Principles

1. **Preserve identity.** One batch of 20 PRs must not cause a full rewrite. The existing persona is the load-bearing truth.
2. **Capture drift.** If a new pattern appears in the batch that was absent before, add it. If a pattern is simply missing from the batch (but not contradicted), leave it.
3. **On conflict, record history.** When the batch contradicts the existing observation, keep the existing as history and mark the shift: "recently prefers X over Y (since #NNN)".
4. **Refresh citations.** Replace old PR citations with recent representative ones. Keep a minority of older cites only if they are the canonical example.
5. **Section 3 still ≥65%.** Meta section still ≤5%.
6. **Update frontmatter fields**: `persona_version`, `last_pr_number`, `updated_at`, `batch_count`.
7. **English only.**

## Output

The full merged persona (frontmatter + body). Nothing before it.

After the body, append a delimiter and a short change summary (this tail will be stripped and used for the PR description):

```
---
## Changes in this batch (v{{prev}} → v{{next}})
- Added: (newly observed patterns)
- Reinforced: (patterns confirmed again in this batch)
- Shifted: (patterns that changed — old → new)
- Removed: (patterns dropped, if any)
```
