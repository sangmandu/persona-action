# Level 1 — Group Analysis Prompt

You are analyzing 5 merged PRs by engineer `{{login}}`. Your goal is to write a short **code-style observation memo**. Look at the actual diff content, not PR descriptions.

## Input
- login: `{{login}}`
- 5 PR diffs attached by the caller

## Output format
5–8 bullets. Each bullet must cover one of these axes:

- Naming (variables, functions, files, components, types, hooks, constants)
- Function shape (length, arg count, early return vs nesting, arrow vs function)
- Type usage (`any`/`unknown`, generics, `satisfies`, `as const`, discriminated union, zod)
- Error & null handling (try/catch boundaries, custom Error classes, fallback strategy, log shape)
- Async & event patterns (async/await vs .then, AbortController, SSE, cancellation)
- Data structures (Map/Set/Record/tuple/object selection rationale)
- Abstraction appetite (when to extract, inline preference, leaf module strategy)
- File & module layout (barrels, import paths, test location)
- Testing (mock policy, fixtures, describe naming, integration vs unit)
- Comments (why vs what, ticket refs, TODO style)
- React hooks / components (ordering, section comments, memoization)
- State management (tanstack query keys, custom stores, enabled flags)
- Platform branching (`process.platform`, bash compatibility)

## Rules
- Every bullet must cite at least one PR number (#NNN) and a file path
- No generic statements ("prefers clean code" is banned)
- **Do NOT write about PR description format, commit message format, or any meta-observation** — those are handled separately
- 3–5 line code snippets allowed if the pattern is striking
- Tone: descriptive ("they prefer X"), not prescriptive ("you should X")

## Note
This memo is an intermediate artifact. Later, 4 memos are synthesized into a final persona. Stay concrete — do not pre-polish for the final output.
