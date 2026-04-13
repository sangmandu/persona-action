# 07 — Reviewer Routing

Generated personas include a `review_routing` YAML block describing which paths and keywords indicate a contributor's territory. Use this to auto-suggest reviewers when a PR opens.

## What routing looks like

Each persona ends with:

```yaml
review_routing:
  primary_paths:
    - libs/local-agent/**
    - apps/poppy-desktop/src/bun/**
  secondary_paths:
    - libs/chat/**
  keywords:
    - sandbox
    - release
    - seatbelt
  expertise_level:
    libs/local-agent: owner
    libs/chat: contributor
```

- `primary_paths` — globs where this person wrote ≥30% of recent lines.
- `secondary_paths` — 10–30% contribution.
- `keywords` — recurring domain terms in their PR titles and bodies.
- `expertise_level` — human-readable summary per path.

The numbers come from diff statistics during batch synthesis.

## CLI usage

```bash
persona-action route \
  --personas .claude/agents \
  --files "libs/local-agent/foo.ts,apps/poppy/bar.tsx" \
  --text "fix sandbox seatbelt profile"
```

Output:

```json
{
  "primary": ["alice"],
  "secondary": ["bob"],
  "all_matched": ["alice", "bob"]
}
```

- `primary` — contributors whose `primary_paths` matched at least one changed file. These are the "obvious reviewers".
- `secondary` — contributors whose `secondary_paths` matched but `primary_paths` did not. They are co-reviewer candidates.
- `all_matched` — union of both plus keyword matches. Useful for broad PRs.

## Wiring into a PR-opened workflow

Create `.github/workflows/assign-reviewers.yml`:

```yaml
name: Assign Reviewers
on:
  pull_request:
    types: [opened, ready_for_review]

permissions:
  pull-requests: write
  contents: read

jobs:
  route:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Compute reviewers
        id: route
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          FILES=$(gh pr view ${{ github.event.pull_request.number }} --json files -q '.files[].path' | paste -sd, -)
          TEXT="${{ github.event.pull_request.title }} ${{ github.event.pull_request.body }}"
          RESULT=$(bun run .persona/persona-action/src/cli.ts route --personas .claude/agents --files "$FILES" --text "$TEXT")
          echo "result=$RESULT" >> $GITHUB_OUTPUT

      - name: Request reviews
        run: |
          REVIEWERS=$(echo '${{ steps.route.outputs.result }}' | jq -r '.all_matched | join(",")')
          if [ -n "$REVIEWERS" ]; then
            gh pr edit ${{ github.event.pull_request.number }} --add-reviewer "$REVIEWERS"
          fi
        env:
          GH_TOKEN: ${{ github.token }}
```

Note: This example vendors `persona-action` at `.persona/persona-action` (a git submodule). If you'd rather not vendor, you can call a lightweight wrapper job that re-uses the action binary.

## Routing rules (what gets suggested)

- **Narrow PR** (files only match one person's `primary_paths`) → that one person is the sole reviewer.
- **Wide PR** (files match multiple primaries) → all of them are requested.
- **Boundary PR** (files only match `secondary_paths`) → secondary reviewers are requested as co-reviewers.
- **Keyword-only match** (title/body keyword hit but no path hit) → contributor joins `all_matched` but not `primary` or `secondary`. Treat as optional.

## Tuning

If the auto-generated `primary_paths` or `keywords` aren't quite right, you can edit the persona file by hand. The drift merge in the next run will preserve your hand-edits as long as they remain consistent with observed patterns.

For aggressive tuning, commit a post-synthesis step that overwrites or adds entries to the routing block.
