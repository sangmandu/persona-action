---
name: install-persona
description: Interactive installer for persona-action. Walks the user through setup questions and generates .persona/config.yml and .github/workflows/persona.yml in the current repo. Use when the user says /install-persona, "install persona-action", "set up persona-action", or similar.
---

# install-persona — Interactive installer

You are setting up [persona-action](https://github.com/sangmandu/persona-action) in the user's current git repository. Ask questions one at a time, show choices when useful, and finally write two files.

## Precondition check (silent, before asking anything)

1. Verify the current working directory is a git repo (`git rev-parse --show-toplevel` succeeds). If not, stop and say: "This command must run inside a git repository."
2. Detect the current repo slug with `gh repo view --json nameWithOwner -q .nameWithOwner`. If `gh` is not authenticated, stop and ask the user to run `gh auth login` first.
3. Check whether `.persona/config.yml` or `.github/workflows/persona.yml` already exists. If either exists, warn and ask whether to overwrite before proceeding.

## Question flow

Ask each question, wait for the answer, then move on. Do not batch questions. Keep your own messages terse.

### Q1. Source repo

Default: the auto-detected slug from the precondition step.

> The `source_repo` will be set to `<detected>`. Press enter to accept, or type a different `owner/repo`.

### Q2. Contributors

> List the GitHub logins to analyze, comma-separated. Only these people will get personas.

Parse the answer into an array. Validate each login with `gh api users/<login>` — if any don't exist, show the failing ones and ask again.

### Q3. Bootstrap mode per contributor

For each contributor, ask:

> For `<login>`, how should the first run start?
>
> 1. Full history (analyze everything from PR #1)
> 2. From a specific PR number
> 3. From a specific date
>
> Pick 1, 2, or 3.

- If 1: no extra field needed.
- If 2: ask "Which PR number?" and store as `start_from_pr: <num>`.
- If 3: ask "Which date? (YYYY-MM-DD)" and store as `start_from_date: "<date>"`.

### Q4. Cron schedule

> How often should personas update?
>
> 1. Daily at 09:00 KST (cron: `"0 0 * * *"`)
> 2. Daily at 00:00 KST (cron: `"0 15 * * *"`)
> 3. Weekly on Monday at 09:00 KST (cron: `"0 0 * * 1"`)
> 4. Weekdays only at 09:00 KST (cron: `"0 0 * * 1-5"`)
> 5. Manual only (no cron — use `workflow_dispatch`)
>
> Pick 1–5.

Store the selected cron expression (or null for option 5).

### Q5. Anthropic API key secret

Check if the secret already exists: `gh secret list --app actions | grep ANTHROPIC_API_KEY`.

- If present: tell the user "ANTHROPIC_API_KEY is already set — good."
- If absent: tell the user:
  > You need to add the `ANTHROPIC_API_KEY` secret before the workflow will run. Run this now or later:
  > ```
  > gh secret set ANTHROPIC_API_KEY
  > ```
  > (Paste your Anthropic key when prompted.)

Do NOT try to set the secret yourself — let the user do it so they stay in control of their key.

### Q6. Preview and confirm

Show the user the two files you're about to write, fully rendered with their answers. Ask:

> About to write:
> - `.persona/config.yml`
> - `.github/workflows/persona.yml`
>
> Proceed? (yes/no)

If yes, write both files. If no, stop without writing anything.

## File generation

### `.persona/config.yml`

```yaml
source_repo: <Q1 answer>

contributors:
  # one entry per contributor from Q2, with optional Q3 fields
  - <login>
  # or
  - login: <login>
    start_from_pr: <num>
  # or
  - login: <login>
    start_from_date: "<date>"

batch_size: 20
min_prs_to_update: 20
max_prs_per_run: 100
output_dir: .claude/agents
state_file: .claude/agents/state.json
model: claude-sonnet-4-5
```

Leave out any field the user did not touch; rely on defaults baked into the action.

### `.github/workflows/persona.yml`

Render the caller workflow with:
- the chosen cron line active (if any)
- `workflow_dispatch` always present
- `uses: sangmandu/persona-action/.github/workflows/persona-update.yml@main`
- `config: .persona/config.yml`

If the user picked option 5 (manual only) in Q4, comment out the entire `schedule:` block and leave `workflow_dispatch:` as the only trigger.

Always keep the top comment block explaining the purpose and the two edit points.

## Post-install summary

After writing both files, print a short summary:

> Wrote:
> - `.persona/config.yml`
> - `.github/workflows/persona.yml`
>
> Next steps:
> 1. Commit both files and open a PR.
> 2. Confirm `ANTHROPIC_API_KEY` is set in repo secrets (if not already).
> 3. Trigger the first run manually:
>    ```
>    gh workflow run persona.yml
>    ```
> 4. When the `[persona-bot] update personas` PR appears, review and merge it.
>
> Everything else is documented in the persona-action repo:
> https://github.com/sangmandu/persona-action

## Rules

- **Never write files until Q6 is confirmed.** Users may back out at any question.
- **Never run `git commit` or `git push`.** File generation only. The user commits themselves.
- **Never store or display the API key.** Key management belongs to the user and `gh secret set`.
- **No destructive git operations.** Do not overwrite existing files without explicit confirmation in the precondition check.
- **English only in generated files.** Comments and YAML values are English regardless of the conversation language.
