# persona-action

Generate personalized **Claude Code sub-agents** from your contributors' merged PR history. Each person gets a living `.claude/agents/<login>.md` file capturing their coding style — naming, control flow, type usage, error handling, test discipline, refactor appetite, review priorities. Claude Code picks them up automatically so you can route PR reviews to the right teammate persona.

## How it works

1. **Daily cron** (or manual dispatch) runs the action in your repo.
2. For each contributor listed in your config, fetch new merged PRs since the last checkpoint.
3. If at least `min_prs_to_update` (default 20) have accumulated, process them in batches of `batch_size` (default 20). Extras are held for the next run.
4. Each batch: 5 PRs → group memo → 4 memos → batch persona → drift-merged into the existing persona.
5. Quality-gated output is written to `.claude/agents/<login>.md` and a PR is opened automatically.

Hard cap per run: `max_prs_per_run` (default 100). Prevents runaway cost on the first execution.

## Install — pick one of two paths

### Path A — Interactive (`/install-persona`)

If you use Claude Code, there's a one-shot installer skill. It asks a few questions and writes both files for you.

```bash
# 1. Clone the repo somewhere
git clone https://github.com/sangmandu/persona-action ~/persona-action

# 2. Symlink the skill into your Claude Code skills directory
ln -s ~/persona-action/skill/install-persona ~/.claude/skills/install-persona
```

Then, inside Claude Code, from your target repo:

```
/install-persona
```

Claude will ask for the source repo, contributors, bootstrap mode, cron schedule, and preview the two files before writing them. After it finishes, commit the files and trigger the first run. You never need the repo clone again.

### Path B — Manual (copy from `examples/`)

No Claude Code needed. Just copy the two files and edit them.

**1. Add your config** at `.persona/config.yml`:

```yaml
source_repo: owner/repo
contributors:
  - alice
  - login: bob
    start_from_pr: 500
  - login: carol
    start_from_date: "2026-01-01"
```

See [`examples/basic-config.yml`](examples/basic-config.yml) for all options.

**2. Add the workflow** at `.github/workflows/persona.yml`:

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

**3. Set `ANTHROPIC_API_KEY`** in your repo secrets.

That's it. The workflow runs daily, opens a PR if any contributor crosses the 20-PR threshold, and keeps the `state.json` checkpoint up to date.

## Bootstrapping from existing personas

Already have persona files? Commit them to `.claude/agents/` before the first run, and set `start_from_pr` (or `start_from_date`) in the config so the action doesn't re-analyze history already covered. The drift-merge stage extends the existing files instead of overwriting them.

## Reviewer routing

Each generated persona includes a `review_routing` YAML block describing which paths the contributor owns and which keywords indicate their territory. Use `persona-action route` to get suggested reviewers for a PR:

```bash
bun run src/cli.ts route \
  --personas .claude/agents \
  --files "libs/local-agent/foo.ts,apps/poppy/bar.tsx" \
  --text "fix sandbox seatbelt profile"
```

Returns:

```json
{
  "primary": ["alice"],
  "secondary": ["bob"],
  "all_matched": ["alice", "bob"]
}
```

Wire this into your own PR-opened workflow to request reviews automatically.

## Persona file structure

Each `.claude/agents/<login>.md` has a fixed section layout:

| Section | Weight | Purpose |
|---|---|---|
| 1. Scope of Work | 3% | Paths / packages / stacks (2–3 sentences) |
| 2. Core Principles | 7% | What this person cares about at the code level |
| 3. **Coding Style** | **65%** | 13 sub-sections with PR citations |
| 4. Review Checkpoints | 10% | Top 5 things they check in reviews |
| 5. Anti-patterns | 8% | Patterns they reject |
| 6. Review Routing | 4% | Machine-readable routing metadata |
| 7. PR Meta (appendix) | 3% | Commit / PR-body habits, max 4 lines |

The template lives at [`templates/style.md`](templates/style.md). Quality gates in [`src/validate.ts`](src/validate.ts) enforce:
- at least 8 of 13 coding-style sub-sections
- at least 12 PR citations in section 3
- routing block with ≥1 primary path and ≥3 keywords
- ≥5 anti-patterns
- meta appendix ≤5% of body

Personas that fail validation are held back — the previous version stays in place.

## Commands

```bash
persona-action run --config <path>                           # full pipeline, used by CI
persona-action validate <persona.md>                          # quality gate on a single file
persona-action route --personas <dir> --files <a,b,c>         # suggest reviewers
```

Everything is config-driven. There is no interactive mode.

## Guides

See [`guides/`](guides/) for step-by-step scenarios:

- [Getting Started](guides/01-getting-started.md) — first run in 10 minutes
- [Bootstrap from Zero](guides/02-bootstrap-from-zero.md)
- [Bootstrap from PR Number](guides/03-bootstrap-from-pr-number.md)
- [Bootstrap from Date](guides/04-bootstrap-from-date.md)
- [Resuming Existing Personas](guides/05-resuming-existing-personas.md)
- [State Management](guides/06-state-management.md)
- [Reviewer Routing](guides/07-reviewer-routing.md)
- [Managing Contributors](guides/08-managing-contributors.md)
- [Troubleshooting](guides/09-troubleshooting.md)
- [Cost and Rate Limits](guides/10-cost-and-rate-limits.md)

## License

MIT
