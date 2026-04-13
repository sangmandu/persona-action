# 04 — Bootstrap from Date

Pin the starting point per contributor using a merged-at date. The action converts the date into the correct PR number automatically.

## When to use

- You want "everything after January 1st" regardless of PR numbering.
- A team-wide style policy or refactor landed on a specific date and older PRs shouldn't pollute the persona.
- Contributors span many PRs and you'd rather pick a date than hunt for a PR number.

## Config

```yaml
source_repo: owner/repo
contributors:
  - login: alice
    start_from_date: "2026-01-01"
  - login: bob
    start_from_date: "2026-03-15"   # bob joined later
```

Dates must be in ISO format (`YYYY-MM-DD`). They are interpreted at midnight UTC.

## How the conversion works

On first bootstrap for a contributor with `start_from_date`:

1. The action calls `gh pr list --author <login> --json number,mergedAt --limit 1000`.
2. It filters to PRs whose `mergedAt` is **before** the cutoff date.
3. The highest PR number among those becomes `last_pr_number`.
4. Any PR merged on or after the cutoff is eligible for analysis in subsequent runs.

If no PRs exist before the cutoff (e.g., the contributor joined after the date), `last_pr_number` is set to `0` and their full post-cutoff history is fair game.

## Combining with `start_from_pr`

`start_from_pr` takes precedence over `start_from_date`. If both are set, `start_from_pr` wins. Don't set both unless you have a reason.

## Important: `start_from_date` is only read once

Like `start_from_pr`, the date is resolved once at bootstrap and written into `state.json`. Changing it later in config.yml has no effect. See [06 — State Management](06-state-management.md) to adjust the checkpoint manually.

## Example timeline

Repo has PRs merged daily since 2020. You set:

```yaml
contributors:
  - login: alice
    start_from_date: "2026-01-01"
```

Alice merged PRs #100 (2020), #500 (2022), #1000 (2024), #1500 (2025-12-01), #1600 (2026-01-05), #1700 (2026-03-10).

Bootstrap result:
- Candidates before cutoff: #100, #500, #1000, #1500
- Highest: #1500
- `last_pr_number: 1500`

First run picks up #1600, #1700, and any newer merged PRs. If that's ≥20, a batch runs. Otherwise skipped until more accumulate.
