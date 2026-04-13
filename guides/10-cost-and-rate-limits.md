# 10 — Cost and Rate Limits

`persona-action` makes Anthropic API calls on every run. This guide helps you predict and cap that cost.

## Per-run arithmetic

One contributor, one 20-PR batch:

- **Group analysis**: 4 calls (one per 5-PR group), ~2k output tokens each, diffs in input
- **Batch synthesis**: 1 call, ~8k output tokens, memos in input
- **Drift merge**: 1 call, ~8k output tokens, existing persona + batch persona in input

Total: **6 calls per batch**, roughly **30–60k input tokens + 20k output tokens** depending on diff size.

At `max_prs_per_run: 100` (5 batches), one contributor = **30 calls, ~250k input + ~100k output tokens**.

## Scaling

| Contributors above threshold | Calls per run | Approx tokens |
|---|---|---|
| 1 | 30 | 350k |
| 3 | 90 | 1M |
| 5 | 150 | 1.8M |
| 10 | 300 | 3.5M |

At current `claude-sonnet-4-5` pricing (check Anthropic's page for exact numbers), 10 active contributors running daily is meaningful but not extreme. One contributor is negligible.

## Cost levers

**Lower `max_prs_per_run`** — the most direct control. Cutting from 100 to 40 cuts cost by 60%.

```yaml
max_prs_per_run: 40
```

Tradeoff: slower catch-up after long quiet periods.

**Raise `min_prs_to_update`** — skips runs for quiet contributors.

```yaml
min_prs_to_update: 40
```

Tradeoff: personas update less often.

**Reduce contributor list** — the single biggest lever. Only track the 3–5 people whose personas you actually use for review routing.

**Run less often** — change cron from daily to weekly:

```yaml
on:
  schedule:
    - cron: "0 0 * * 0"  # Sundays only
```

Tradeoff: staler personas, but cost drops 7x.

**Switch model** — use a cheaper model for group analysis (memos) and keep batch synthesis / drift merge on Sonnet. Not supported in the default config; you'd need to fork and edit `src/analyze.ts`.

## Rate limiting

Default batching runs calls sequentially, which is slow but stays well under Anthropic's per-minute limits. A 100-PR run takes 5–15 minutes depending on diff size.

If you hit rate limits, it's almost always because you're on a lower usage tier. The action does not implement retry-with-backoff on rate-limit errors — a run that hits 429 fails the contributor and leaves `state.json` unchanged, so the next run will retry from the same point.

## Monitoring

Every run prints a JSON summary:

```json
[{ "contributor": "alice", "status": "updated", "batches_run": 3, "new_last_pr": 1300 }]
```

For richer cost tracking, wrap the action in a step that parses this output and pushes numbers to your monitoring system:

```yaml
- name: Publish metrics
  run: |
    echo '${{ steps.persona.outputs.summary }}' | jq -r '.[] | "persona.\(.contributor).batches \(.batches_run)"' \
      >> metrics.txt
```

## Budget safety

If you want a hard API-spend ceiling, set one in your Anthropic console (Settings → Usage limits). The action respects whatever limit Anthropic enforces — a budget cut-off will surface as API errors and fail the run cleanly, leaving `state.json` untouched for retry.
