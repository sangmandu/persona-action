# 05 — Resuming Existing Personas

You already have hand-written or previously-generated persona files and want the action to **extend** them instead of starting over.

## When to use

- You generated personas manually (or with an earlier script) and they are good.
- You want `persona-action` to keep them fresh with drift merges, not re-run from scratch.
- You're migrating from another persona tool.

## Step 1 — Normalize the existing files

Persona files must match the English template layout (see [`templates/style.md`](../templates/style.md)):

- Section headings: `## Scope of Work`, `## Core Principles`, `## Coding Style`, `## Review Checkpoints`, `## Anti-patterns`, `## Review Routing`, `## PR Meta (appendix)`
- Frontmatter fields: `name`, `description`, `tools`, `model`, plus meta fields (`persona_version`, `last_pr_number`, `batch_count`, `updated_at`, `source_repo`)
- At least 8 `###` sub-sections under `## Coding Style`
- At least 12 PR citations (`#NNN`) in the Coding Style block
- A `review_routing` YAML block with at least one `primary_paths` entry and three `keywords`
- At least 5 anti-patterns

Run the validator to confirm:

```bash
bun run src/cli.ts validate .claude/agents/alice.md
```

Fix any errors listed. The validator will tell you exactly what's missing.

## Step 2 — Commit the files

```bash
mkdir -p .claude/agents
cp alice.md bob.md .claude/agents/
git add .claude/agents/
git commit -m "Seed personas for persona-action"
```

## Step 3 — Create `state.json` by hand

Also in `.claude/agents/`, create `state.json` so the action doesn't try to re-analyze history already covered:

```json
{
  "version": 1,
  "contributors": {
    "alice": {
      "last_pr_number": 1234,
      "batches_processed": 3,
      "persona_version": 3,
      "updated_at": "2026-04-13"
    },
    "bob": {
      "last_pr_number": 987,
      "batches_processed": 2,
      "persona_version": 2,
      "updated_at": "2026-04-13"
    }
  }
}
```

`last_pr_number` must be the highest PR number already reflected in the persona. If you're unsure, look at the most recent PR citation in the file.

## Step 4 — Config

```yaml
source_repo: owner/repo
contributors:
  - alice
  - bob
```

No `start_from_pr` needed — `state.json` already has their checkpoints. If you add a new contributor later who wasn't in `state.json`, they'll bootstrap from config (see scenarios [02](02-bootstrap-from-zero.md), [03](03-bootstrap-from-pr-number.md), [04](04-bootstrap-from-date.md)).

## Step 5 — First run

On the next scheduled run or a manual `workflow_dispatch`:

1. For alice: fetch PRs > #1234. If ≥20 new, run group analysis → batch synthesis → drift merge.
2. The drift merge prompt receives both the existing persona and the new batch persona, and extends the existing file instead of rewriting it.
3. `persona_version` increments (3 → 4). Citations refresh to the most recent examples.

## Pitfalls

**Wrong `last_pr_number`** — If you set it too high, newer PRs are skipped. Set it too low, and the next run re-analyzes PRs already covered (still correct, just wasted work).

**Files that don't pass validation** — The action won't overwrite an invalid file. Fix validation errors before committing. Use `validate` subcommand locally first.

**Mismatched section headings** — If your existing personas use different heading names (e.g., localized), either rename them or regenerate from scratch using [02 — Bootstrap from Zero](02-bootstrap-from-zero.md). Half-matching layouts are rejected by the quality gate.
