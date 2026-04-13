# 09 — Troubleshooting

Common failures and how to fix them.

## `validation failed` for a contributor

The generated persona didn't pass the quality gate in `src/validate.ts`. The JSON summary in the workflow log lists exact errors, for example:

```json
"validation_errors": [
  "Code style sub-sections: 6 (need >=8)",
  "PR citations in Coding Style: 9 (need >=12)"
]
```

Meaning: the LLM produced a persona that's too thin. Causes and fixes:

- **Too few PRs in the batch** — fewer than 20 PRs means the group memos are weak. The action already enforces `min_prs_to_update: 20`, but diffs can be near-empty. Wait for the contributor to accumulate more substantive PRs.
- **Diffs are all trivial** (version bumps, lockfile updates, dependabot merges) — the analysis has no real code to observe. Filter noise via the `paths` config (planned feature) or change the contributor's start point to skip the noisy range.
- **Prompt is under-constraining** — if repeated failures come from the same kind of contributor, tighten `prompts/batch-synthesis.md` to be stricter about citation density. The failing persona is never written to disk, so the previous version stays in place.

## Contributor always `skipped`

The workflow log shows:

```json
{ "contributor": "alice", "status": "skipped", "reason": "only 7 new PRs (threshold 20)" }
```

Meaning: alice hasn't merged enough new PRs since her last checkpoint. This is normal and expected for quiet contributors. The run resumes them automatically as soon as they cross 20.

If you want them updated sooner, lower `min_prs_to_update` globally in `config.yml`:

```yaml
min_prs_to_update: 10
```

Note: below ~10, personas start drifting on thin evidence. Not recommended.

## First run burned through API budget

The default `max_prs_per_run: 100` caps one run. If you set it higher and hit the wall, reduce it back:

```yaml
max_prs_per_run: 60
```

See also [10 — Cost and Rate Limits](10-cost-and-rate-limits.md).

## `gh: not found` in CI logs

The composite action relies on `gh` CLI being pre-installed on the runner. `ubuntu-latest` ships with it. If you're using a custom image, install it:

```yaml
- name: Install gh
  run: |
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list
    sudo apt update && sudo apt install -y gh
```

## `GH_TOKEN` errors / 403s from the GitHub API

The reusable workflow passes `github.token` as `GH_TOKEN`. For private repos in the same org, this works. For cross-org access, use a PAT:

```yaml
- uses: sangmandu/persona-action@main
  with:
    config: .persona/config.yml
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
  env:
    GH_TOKEN: ${{ secrets.GH_PAT }}
```

## The bot PR already exists and I can't merge due to conflicts

`peter-evans/create-pull-request` updates the branch in place. If you have a stale PR open, close it and let the next run recreate it. Or rebase manually:

```bash
gh pr checkout <PR_NUMBER>
git rebase origin/main
git push --force-with-lease
```

## Persona file contains Korean / non-English content

The synthesis prompt says "English throughout" but the LLM may leak the source language if diffs are dense with non-English comments. Fix by tightening `prompts/batch-synthesis.md`:

```
**Language**: English only. If diffs contain non-English comments, preserve the observation but describe it in English.
```

Re-run the failing contributor by lowering their `last_pr_number` in `state.json`.

## `unknown command` from CLI

```
persona-action validate: Usage: persona-action validate <persona.md>
```

The positional argument after the subcommand is required. The CLI does not prompt interactively by design. Correct call:

```bash
bun run src/cli.ts validate .claude/agents/alice-style.md
```

## Nothing happens on cron but `workflow_dispatch` works

GitHub disables scheduled workflows in repos with no activity for 60 days. Push any commit to wake them up, or switch to an external scheduler.

## `state.json` conflict on merge

Two runs overlapped and both updated `state.json`. Resolution:
1. Pick the one with higher `last_pr_number` values per contributor (union of the most recent).
2. Accept the merge.
3. The next run will no-op for contributors already covered, and pick up the leftover tail.
