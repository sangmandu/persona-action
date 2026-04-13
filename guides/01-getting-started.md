# 01 — Getting Started

Goal: your first persona update PR in under 10 minutes.

## Prerequisites

- A GitHub repository you own or can push workflows to
- Anthropic API key (`ANTHROPIC_API_KEY`)
- At least one contributor with 20+ merged PRs in your repo

## Step 1 — Add the workflow

Create `.github/workflows/persona.yml` in your repo:

```yaml
name: Update Personas
on:
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

jobs:
  update:
    uses: sangmandu/persona-action/.github/workflows/persona-update.yml@main
    with:
      config: .persona/config.yml
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Step 2 — Add the config

Create `.persona/config.yml`:

```yaml
source_repo: owner/repo
contributors:
  - alice
  - bob
```

That's all. Bootstrapping from zero is fine for a small team or for testing. If you have lots of old history and want to cap cost, see [03 — Bootstrap from PR Number](03-bootstrap-from-pr-number.md).

## Step 3 — Add the secret

GitHub → repo → Settings → Secrets and variables → Actions → New repository secret:
- Name: `ANTHROPIC_API_KEY`
- Value: your key

## Step 4 — Run it manually once

GitHub → repo → Actions → "Update Personas" → Run workflow.

The action will:
1. Read your config.
2. For each contributor, fetch merged PRs newer than the checkpoint in `state.json` (first run = all of them).
3. Skip anyone with fewer than 20 new PRs.
4. Process the rest in batches of 20, up to 100 per run.
5. Open a PR titled `[persona-bot] update personas` with the new `.claude/agents/<login>-style.md` files and an updated `state.json`.

## Step 5 — Merge the PR

Review the generated persona files, merge, and the daily cron takes over from there.

## What's next

- If the first-run analysis is too heavy on history, see [03 — Bootstrap from PR Number](03-bootstrap-from-pr-number.md) or [04 — Bootstrap from Date](04-bootstrap-from-date.md).
- To use personas for automatic review assignment, see [07 — Reviewer Routing](07-reviewer-routing.md).
