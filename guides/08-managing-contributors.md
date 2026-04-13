# 08 — Managing Contributors

How to add, remove, pause, or change contributors after the first run.

## Add a new contributor

Edit `config.yml`:

```yaml
contributors:
  - alice
  - bob
  - login: dave          # newcomer
    start_from_pr: 1500
```

Commit. The next run:
- Alice and bob keep their existing checkpoints in `state.json`.
- Dave is not in `state.json` → bootstrap applies. His `start_from_pr: 1500` is resolved to `last_pr_number: 1500`.
- If dave has ≥20 merged PRs after #1500, a first batch runs.

Repeat for as many newcomers as you want in a single commit.

## Remove a contributor

Remove the entry from `config.yml`:

```yaml
contributors:
  - alice
  # bob removed
```

Their `state.json` entry and existing persona file are **not** touched automatically — they remain as historical artifacts. If you want to clean up:

```bash
jq 'del(.contributors["bob"])' .claude/agents/state.json > /tmp/s.json
mv /tmp/s.json .claude/agents/state.json
rm .claude/agents/bob.md
git commit -am "Remove bob from persona tracking"
```

## Pause a contributor temporarily

Three options depending on what "pause" means:

**Option A — keep the current persona, don't update it further**
Remove them from `config.yml`. The existing persona file and `state.json` entry stay intact. Re-add the config entry later to resume — the checkpoint will pick up where it left off.

**Option B — keep updating but lower the threshold so they stop qualifying**
Not recommended. `min_prs_to_update` is global; you can't lower it for one person.

**Option C — block them by raising their checkpoint to infinity**
Edit `state.json`:

```json
"bob": { "last_pr_number": 999999999, ... }
```

Updates stop (no PR will ever exceed that number) but the file stays. Revert when you want to resume.

## Change a contributor's starting point

`start_from_pr` in config is only read at bootstrap. Once in state, you must edit `state.json` directly:

```json
"alice": { "last_pr_number": 1000, ... }
```

Next run will re-analyze PRs #1001 onward.

## Rename a contributor (GitHub login changed)

GitHub login is the unique key everywhere. If someone's login changes:

1. Their new login is essentially a new contributor.
2. Add the new login to `config.yml`.
3. Optionally copy `state.json` and persona file under the new login to preserve history:

```bash
jq --arg old oldLogin --arg new newLogin '.contributors[$new] = .contributors[$old] | del(.contributors[$old])' \
  .claude/agents/state.json > /tmp/s.json
mv /tmp/s.json .claude/agents/state.json
git mv .claude/agents/oldLogin.md .claude/agents/newLogin.md
```

Also update the frontmatter `name` field inside the persona file to match.

## Replace one contributor's persona with another person's

Don't. Personas are tied to GitHub authorship and the whole point is fidelity to one person's style. If you need a generic team persona, generate it separately with a dedicated config and commit it as a hand-maintained file outside the action's output directory.

## Inspecting the current contributor list

The single source of truth is `config.yml`. The `state.json` may contain stale entries (removed contributors) if you haven't cleaned them up. To see what's actively tracked right now:

```bash
yq '.contributors' .persona/config.yml
```
