# 06 — State Management

`.claude/agents/state.json` is the persona system's single source of truth for "what's been processed". This guide covers its structure and how to recover from common mistakes.

## File location

Default: `<output_dir>/state.json` — same directory as the persona files. Override with `state_file` in config if needed.

## Structure

```json
{
  "version": 1,
  "contributors": {
    "alice": {
      "last_pr_number": 1234,
      "batches_processed": 5,
      "persona_version": 5,
      "updated_at": "2026-04-13"
    }
  }
}
```

Fields per contributor:

| Field | Meaning |
|---|---|
| `last_pr_number` | Highest merged PR number included in the persona. Next run selects PRs with `number > last_pr_number`. |
| `batches_processed` | Cumulative count of 20-PR batches applied. |
| `persona_version` | Equals `batches_processed` after drift merges. Tracks how many times the persona has been updated. |
| `updated_at` | Date of the last successful run (`YYYY-MM-DD`, UTC). |

## Read flow

1. Action boots, loads `state.json`.
2. For each contributor in config:
   - If present in state → use it.
   - If missing → bootstrap using `start_from_pr` / `start_from_date` / default 0.
3. Runs pipeline, updates state on success.
4. Writes state back to disk.
5. Everything (personas + state) is committed into the bot PR.

## Important: `start_from_*` is only read at bootstrap

Once a contributor is in `state.json`, their `start_from_pr` or `start_from_date` in `config.yml` is **ignored**. The state is the source of truth going forward.

## Common recovery scenarios

### Restart a contributor from scratch

Delete their entry from `state.json` and their persona file:

```bash
jq 'del(.contributors["alice"])' .claude/agents/state.json > /tmp/s.json
mv /tmp/s.json .claude/agents/state.json
rm .claude/agents/alice.md
git commit -am "Reset alice persona"
```

Next run will re-bootstrap alice using her config entry.

### Re-process a range of PRs

Lower `last_pr_number` in `state.json` to the value you want to restart from:

```json
"alice": { "last_pr_number": 1000, ... }
```

The next run fetches PRs > 1000 and re-analyzes them (drift merge will reconcile with the existing persona).

### Skip a range of PRs

Raise `last_pr_number` in `state.json`. Those PRs will never be analyzed.

Useful when a block of PRs is known to be noise (mass revert, vendored dump, etc.) and you don't want them in the persona.

### Lost state file but personas still exist

If `state.json` is missing but `.claude/agents/alice.md` is intact, recover by reading the persona's frontmatter:

```yaml
---
last_pr_number: 1234
batch_count: 5
persona_version: 5
updated_at: 2026-04-13
---
```

Re-create `state.json` by hand from those fields. The action preserves these in the frontmatter specifically so state can be rebuilt if lost.

### Add a brand-new contributor without disturbing others

Add them to `config.yml`, do **not** touch `state.json`. The existing contributors stay on their checkpoints; the new one bootstraps on the next run.

### Bulk rebuild all personas

Delete `state.json` and all `.claude/agents/*.md`. Next run bootstraps everyone fresh. Cost warning — see [10 — Cost and Rate Limits](10-cost-and-rate-limits.md).

## What `state.json` is NOT

- Not a log. It only holds the latest checkpoint.
- Not a PR history cache. PR data is re-fetched from GitHub each run.
- Not a lock. Concurrent runs on the same branch can cause conflicts; GitHub Actions normally serializes scheduled runs per workflow, so this is rarely an issue, but don't dispatch the workflow manually while a scheduled run is in progress.

## Debugging: what did the last run actually do?

Every run prints a JSON summary to stdout:

```json
[
  { "contributor": "alice", "status": "updated", "batches_run": 3, "new_last_pr": 1300 },
  { "contributor": "bob",   "status": "skipped", "reason": "only 12 new PRs (threshold 20)", "batches_run": 0 },
  { "contributor": "carol", "status": "failed",  "reason": "validation failed", "validation_errors": ["..."] }
]
```

Check the workflow logs in GitHub Actions → Update Personas → the latest run → "Run persona-action" step for this summary.
