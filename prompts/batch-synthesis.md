# Level 2 — Batch Synthesis Prompt

You are given 4 group memos (20 PRs total) for engineer `{{login}}`. Synthesize them into a final persona markdown following `templates/style.md`.

## Input
- login: `{{login}}`
- 4 group memos (5 PR observations each)
- Template: `templates/style.md`
- Meta: `{{meta_json}}` (persona_version, last_pr_number, batch_count, updated_at, source_repo)

## Section weights (enforce)
Body length budget:

| Section | Target |
|---|---|
| 1. Scope of Work | 3% |
| 2. Core Principles | 7% |
| 3. Coding Style | **65%** |
| 4. Review Checkpoints | 10% |
| 5. Anti-patterns | 8% |
| 6. Review Routing | 4% |
| 7. PR Meta (appendix) | **3% max (≤4 lines)** |

If section 7 exceeds 5% of body, the output fails validation. Do not let meta observations swallow the persona.

## Section 3 — Coding Style (the heart)

13 sub-sections. Keep only the ones actually observed in the memos; drop empty ones entirely. **Minimum 8 sub-sections must be present.**

- Naming / Functions & Control Flow / Type Usage / Error & Null Handling / Async & Event Patterns / Data Structures / Abstraction & Reuse / File & Module Layout / Testing / Comments / React Components & Hooks / State Management & Data Fetching / Platform Branching

**Citation requirement**: section 3 must contain **at least 12 PR citations** (`#NNN` + file path). If you have fewer, the observations are too vague — go back to the memos and extract more specifics.

**Code snippets**: allowed, but total snippet lines across section 3 ≤ 20.

## Section 4 — Review Checkpoints (exactly 5)

Question form: "Is X Y?" The LLM will use this as a direct review checklist later.

## Section 5 — Anti-patterns (5–10)

Terse noun phrases. "No X", "never Y" style.

## Section 6 — Review Routing (YAML block)

Populate from diff statistics:

```yaml
review_routing:
  primary_paths:        # paths where this person wrote >=30% of recent lines (globs)
    - libs/foo/**
  secondary_paths:      # 10-30% contribution
    - libs/bar/**
  keywords:             # domain terms recurring in PR titles/bodies, min 3
    - sandbox
    - release
  expertise_level:
    libs/foo: owner
    libs/bar: contributor
```

## Section 7 — Appendix (3–4 lines)

- commit message: (one line)
- PR body: (one line)
- scope: (one line)
- fix PRs: (one line)

## Tone rules

- Descriptive ("they prefer X"), not prescriptive ("should" / "must")
- No meta-skills (teamwork, communication)
- No generic statements — always a concrete pattern with citations
- English throughout, including bullet content (engineers on the team may read Korean source, but persona output stays English for portability)

## Output

A single markdown document with the frontmatter filled and all `{{placeholder}}` values substituted. Nothing before or after.
