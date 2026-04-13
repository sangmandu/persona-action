# examples/

Ready-to-copy files for installing persona-action in your repo.

## Two files to copy

| From | To (in your repo) | What to edit |
|---|---|---|
| [`caller-workflow.yml`](caller-workflow.yml) | `.github/workflows/persona.yml` | Uncomment one `cron:` line under `schedule:` |
| [`basic-config.yml`](basic-config.yml) | `.persona/config.yml` | `source_repo` + `contributors` |

## 5-step install

```bash
# 1. From your repo root:
mkdir -p .github/workflows .persona
curl -sSL https://raw.githubusercontent.com/sangmandu/persona-action/main/examples/caller-workflow.yml \
  > .github/workflows/persona.yml
curl -sSL https://raw.githubusercontent.com/sangmandu/persona-action/main/examples/basic-config.yml \
  > .persona/config.yml

# 2. Edit .persona/config.yml:
#    - source_repo: set to "owner/repo"
#    - contributors: list your team's GitHub logins

# 3. Edit .github/workflows/persona.yml:
#    - Uncomment one `cron:` line under `schedule:` (or leave cron off
#      and rely on manual dispatch)

# 4. Set the Anthropic API key secret in GitHub:
#    Settings → Secrets and variables → Actions → New repository secret
#    Name:  ANTHROPIC_API_KEY
#    Value: (your key)

# 5. Trigger the first run manually:
#    Actions tab → Update Personas → Run workflow
```

The first run opens a PR titled `[persona-bot] update personas`. Review it and merge. Subsequent runs happen automatically according to the cron schedule you picked.

## Which bootstrap mode should I pick?

The `contributors` list in `basic-config.yml` supports three bootstrap modes. Pick one per contributor depending on your situation:

| Your situation | Mode | Guide |
|---|---|---|
| Small repo, want full history | plain login string | [02](../guides/02-bootstrap-from-zero.md) |
| Long history, cap by PR number | `start_from_pr: <num>` | [03](../guides/03-bootstrap-from-pr-number.md) |
| Long history, cap by date | `start_from_date: "YYYY-MM-DD"` | [04](../guides/04-bootstrap-from-date.md) |
| Already have persona files to extend | any, plus seed `state.json` | [05](../guides/05-resuming-existing-personas.md) |

## Prefer an interactive installer?

Run `/install-persona` inside Claude Code — it walks you through the same setup with questions and writes both files for you. See the root [`README.md`](../README.md) for install instructions.
