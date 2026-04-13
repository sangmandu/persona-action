# 03 — Bootstrap from PR Number

Pin the starting point per contributor using a PR number. Recommended for most real-world repos.

## When to use

- Your repo has long history but you only care about recent style.
- Contributors joined at different times and should start at different points.
- You want deterministic, easy-to-reason-about first-run cost.

## Config

```yaml
source_repo: owner/repo
contributors:
  - login: alice
    start_from_pr: 1200
  - login: bob
    start_from_pr: 800
  - login: carol
    start_from_pr: 1500
```

How to pick a number: find the PR in the GitHub UI that represents "the baseline — anything before this is considered too old". Use that PR's number. Everything **after** that PR will be analyzed.

## What happens on the first run

1. `state.json` is missing, so bootstrap resolves `start_from_pr` into `last_pr_number`.
2. Alice starts at `last_pr_number: 1200` — her first run picks up PRs #1201, #1202, …
3. Same for bob and carol with their own numbers.
4. Standard batch rules apply: need ≥20 new PRs, max 100 processed per run.

## Important: `start_from_pr` is only read once

After the first bootstrap, `state.json` is written and becomes the source of truth. Changing `start_from_pr` in config.yml **will not** re-run the bootstrap for that contributor. If you need to change the starting point later, see [06 — State Management](06-state-management.md).

## Recommended first-number heuristic

Count backwards by about `max_prs_per_run × 2` from the latest PR. This gives you:
- Enough history for a meaningful first persona.
- Enough runway so the first run fills the max (gives you a full 100-PR baseline).
- Manageable cost.

Example: if the latest PR is #2000 and `max_prs_per_run: 100`, set `start_from_pr: 1800`. The first run will pick up ~200 PRs for active contributors, process 100, and carry the rest forward.

## Verification

After the first run, check the state file. `last_pr_number` should be somewhere between your configured `start_from_pr` and the latest PR number, depending on how many were processed.

```json
"alice": {
  "last_pr_number": 1300,
  "batches_processed": 5,
  "persona_version": 5,
  "updated_at": "2026-04-13"
}
```

This means: 100 PRs between #1201 and #1300 were processed. PRs #1301+ are still pending.
