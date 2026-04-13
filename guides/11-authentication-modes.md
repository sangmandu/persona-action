# 11 — Authentication Modes

persona-action supports two auth modes. Pick one — you do not need both.

## Mode A — Anthropic API key

- **Secret**: `ANTHROPIC_API_KEY`
- **Under the hood**: `@anthropic-ai/sdk` calls `api.anthropic.com` directly.
- **Billing**: per-token, charged to the API key's Anthropic account.
- **Quota**: your API account's rate limits.
- **Best for**: teams that already have Anthropic API billing set up and want strict per-repo cost attribution.

### Setup

1. Get an API key from <https://console.anthropic.com>.
2. Add it to your repo (or org) secrets as `ANTHROPIC_API_KEY`.
3. Leave `CLAUDE_CODE_OAUTH_TOKEN` unset.

## Mode B — Claude Code OAuth token

- **Secret**: `CLAUDE_CODE_OAUTH_TOKEN`
- **Under the hood**: persona-action installs the `@anthropic-ai/claude-code` CLI on the runner and shells out to `claude -p` with the OAuth token in env. The subprocess uses your existing Claude Code subscription.
- **Billing**: charged against the subscription seat that issued the token.
- **Quota**: your Claude Code seat's usage limits. Daily cron eats into the same quota your interactive Claude Code sessions use.
- **Best for**: teams already running `anthropics/claude-code-action@v1` in CI who want to reuse the same org-level secret.

### Setup

1. Generate an OAuth token: <https://docs.claude.com/en/docs/claude-code/oauth-tokens>
2. Add it as a repo or org secret named `CLAUDE_CODE_OAUTH_TOKEN`.
3. Leave `ANTHROPIC_API_KEY` unset.

### Quota warning

Every persona run issues roughly `(new_prs / 5) + 2` LLM calls per contributor at Opus pricing. A daily cron across 5 contributors at the default 100-PR cap consumes non-trivial subscription quota. Monitor usage after the first week and lower `max_prs_per_run` if needed.

## Caller workflow examples

**Mode A:**

```yaml
jobs:
  update:
    uses: sangmandu/persona-action/.github/workflows/persona-update.yml@main
    with:
      config: .persona/config.yml
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**Mode B:**

```yaml
jobs:
  update:
    uses: sangmandu/persona-action/.github/workflows/persona-update.yml@main
    with:
      config: .persona/config.yml
    secrets:
      CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

## Runtime selection

`src/llm.ts` auto-detects which mode to use based on environment variables, in this order:

1. `PERSONA_AUTH_MODE=oauth` → force OAuth
2. `PERSONA_AUTH_MODE=api_key` → force API key
3. `CLAUDE_CODE_OAUTH_TOKEN` present → OAuth
4. `ANTHROPIC_API_KEY` present → API key
5. Neither → hard error before any work is done

Both secrets set at once is allowed but not recommended; OAuth wins by the ordering above.

## Troubleshooting

**`claude: command not found` in Mode B** — The composite action installs the CLI via `npm install -g @anthropic-ai/claude-code` when `claude_code_oauth_token` is set. If you're calling the composite action directly (not through the reusable workflow), make sure you pass the token as an input, not just an env var — the install step is gated on the input.

**`Invalid OAuth token`** — The token has expired or was revoked. Regenerate from Claude Code settings and update the secret.

**Rate limit / quota errors** — Mode B shares the subscription quota with interactive Claude Code use. Lower `max_prs_per_run` in `config.yml` or switch to Mode A.

**Project context leaking into personas** — `ClaudeCliClient` sets `CLAUDE_CODE_NO_PROJECT_CONTEXT=1` so the caller repo's `CLAUDE.md` and `.claude/` do not contaminate the LLM input. If you still see bleed-through, open an issue.
