# 02 — Bootstrap from Zero

When you have no prior personas and no `state.json`, the action starts each contributor at `last_pr_number = 0` and processes their entire merged history (capped by `max_prs_per_run`).

## When to use

- Small teams (≤5 contributors) or small repos (≤200 merged PRs per person).
- You want a full history reflected in the persona, not just recent patterns.
- You are testing the tool and want to see what it produces end-to-end.

## Config

```yaml
source_repo: owner/repo
contributors:
  - alice
  - bob
  - carol
```

No `start_from_pr`, no `start_from_date`. Defaults handle everything.

## What happens on the first run

1. `state.json` is missing, so every contributor bootstraps with `last_pr_number: 0`.
2. `gh pr list --author <login> --state merged` returns all their PRs (oldest first, within `max_prs_per_run + 50` cap).
3. For each contributor with at least 20 new PRs, batches are formed (20 per batch, up to 5 batches = 100 PRs per run).
4. Leftover PRs carry over to the next daily run automatically.

## Example

Alice has 150 merged PRs, bob has 45, carol has 8.

- Alice: 100 processed today (5 batches), 50 held over. Tomorrow: 50 processed (2 batches of 20, 10 left over). Day after: 10 + any new ones.
- Bob: 40 processed today (2 batches), 5 held over.
- Carol: skipped — only 8 PRs, below `min_prs_to_update: 20`. Will wait until she has 20.

## Cost warning

Bootstrap from zero can be expensive if you have many active contributors. A rough estimate: one run processing 100 PRs does ~20 group-analysis calls + 5 batch-synthesis calls + 5 drift-merge calls. Multiply by the number of contributors above threshold.

If you have 10+ active contributors, prefer [03 — Bootstrap from PR Number](03-bootstrap-from-pr-number.md) or [04 — Bootstrap from Date](04-bootstrap-from-date.md) to cap the starting point.

## How to verify

After the first run, check `.claude/agents/state.json` in the bot PR. Each contributor should have:

```json
"alice": {
  "last_pr_number": <some_pr_number>,
  "batches_processed": 5,
  "persona_version": 5,
  "updated_at": "YYYY-MM-DD"
}
```

`last_pr_number` is the number of the most recent PR included in this run. The next day, anything `> last_pr_number` is fair game.
