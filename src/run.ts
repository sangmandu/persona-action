import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PersonaConfig } from "./config.ts";
import type { ContributorState } from "./state.ts";
import { loadState, saveState } from "./state.ts";
import { listMergedPrs, resolveStartPr } from "./fetch.ts";
import { groupPrsForLevel1 } from "./batch.ts";
import {
  analyzeGroup,
  synthesizeBatchPersona,
  driftMerge,
} from "./analyze.ts";
import { validatePersona } from "./validate.ts";
import { createLimiter, type Limiter } from "./concurrency.ts";

export interface RunSummary {
  contributor: string;
  status: "skipped" | "updated" | "failed";
  reason?: string;
  batches_run: number;
  new_last_pr?: number;
  validation_errors?: string[];
}

function log(msg: string): void {
  const ts = new Date().toISOString().slice(11, 19);
  process.stderr.write(`[${ts}] ${msg}\n`);
}

export async function runOnce(cfg: PersonaConfig): Promise<RunSummary[]> {
  const state = loadState(cfg.state_file);
  mkdirSync(cfg.output_dir, { recursive: true });
  const limiter = createLimiter(cfg.concurrency);
  log(
    `run start — ${cfg.contributors.length} contributors, model=${cfg.model}, concurrency=${cfg.concurrency}`,
  );

  const results = await Promise.all(
    cfg.contributors.map((contrib) =>
      processContributor(cfg, contrib.login, state, limiter, contrib.start_from_pr, contrib.start_from_date),
    ),
  );

  saveState(cfg.state_file, state);
  log(`run complete — saved state to ${cfg.state_file}`);
  return results;
}

async function processContributor(
  cfg: PersonaConfig,
  login: string,
  state: { contributors: Record<string, ContributorState> },
  limiter: Limiter,
  startFromPr?: number,
  startFromDate?: string,
): Promise<RunSummary> {
  log(`[${login}] begin`);
  let cState = state.contributors[login];
  if (!cState) {
    const startPr = resolveStartPr(cfg.source_repo, login, startFromPr, startFromDate);
    cState = {
      last_pr_number: startPr,
      batches_processed: 0,
      persona_version: 0,
      updated_at: new Date().toISOString().slice(0, 10),
    };
    state.contributors[login] = cState;
  }

  log(`[${login}] listing merged PRs since #${cState.last_pr_number}`);
  const newPrs = listMergedPrs(
    cfg.source_repo,
    login,
    cState.last_pr_number,
    cfg.max_prs_per_run + 50,
  );
  log(`[${login}] found ${newPrs.length} new PRs`);

  if (newPrs.length < cfg.min_prs_to_update) {
    const reason = `only ${newPrs.length} new PRs (threshold ${cfg.min_prs_to_update})`;
    log(`[${login}] skipped — ${reason}`);
    return { contributor: login, status: "skipped", reason, batches_run: 0 };
  }

  const toProcess = newPrs.slice(0, cfg.max_prs_per_run);
  const groups = groupPrsForLevel1(toProcess, 5);
  const lastPrNumber = toProcess[toProcess.length - 1]?.number ?? cState.last_pr_number;
  log(
    `[${login}] processing ${toProcess.length} PRs in ${groups.length} groups (parallel via shared limiter)`,
  );

  try {
    // Phase 1: parallel group analysis
    const memos = await Promise.all(
      groups.map((group, idx) =>
        limiter.run(async () => {
          const prNums = group.map((p) => `#${p.number}`).join(",");
          log(`[${login}]   group ${idx + 1}/${groups.length} (${prNums}) start`);
          const memo = await analyzeGroup(group, {
            repo: cfg.source_repo,
            login,
            model: cfg.model,
          });
          log(
            `[${login}]   group ${idx + 1}/${groups.length} done (${memo.length} chars)`,
          );
          return memo;
        }),
      ),
    );

    // Phase 2: single synthesis from all memos
    const meta = {
      persona_version: cState.persona_version + 1,
      last_pr_number: lastPrNumber,
      batch_count: cState.batches_processed + 1,
      updated_at: new Date().toISOString().slice(0, 10),
    };
    log(`[${login}] synthesizing persona from ${memos.length} memos`);
    const newPersona = await limiter.run(() =>
      synthesizeBatchPersona(memos, {
        repo: cfg.source_repo,
        login,
        model: cfg.model,
        meta,
      }),
    );
    log(`[${login}] synthesis done (${newPersona.length} chars)`);

    // Phase 3: drift merge if existing persona present
    const existing = readExistingPersona(cfg, login);
    let finalPersona = newPersona;
    if (existing) {
      log(`[${login}] drift merging with existing persona (${existing.length} chars)`);
      const merged = await limiter.run(() =>
        driftMerge(existing, newPersona, {
          repo: cfg.source_repo,
          login,
          model: cfg.model,
          meta,
        }),
      );
      finalPersona = merged.persona;
      log(`[${login}] drift merge done (${finalPersona.length} chars)`);
    }

    // Phase 4: validate + write
    const validation = validatePersona(finalPersona);
    if (!validation.ok) {
      log(`[${login}] validation FAILED — ${validation.errors.join("; ")}`);
      return {
        contributor: login,
        status: "failed",
        reason: "validation failed",
        validation_errors: validation.errors,
        batches_run: 1,
      };
    }

    writePersonaFile(cfg, login, finalPersona);
    state.contributors[login] = {
      last_pr_number: lastPrNumber,
      batches_processed: cState.batches_processed + 1,
      persona_version: meta.persona_version,
      updated_at: meta.updated_at,
    };
    log(
      `[${login}] updated ok — last_pr=${lastPrNumber}, persona=${finalPersona.length} chars`,
    );
    return {
      contributor: login,
      status: "updated",
      batches_run: 1,
      new_last_pr: lastPrNumber,
    };
  } catch (e) {
    const msg = (e as Error).message;
    log(`[${login}] FAILED — ${msg.slice(0, 200)}`);
    return {
      contributor: login,
      status: "failed",
      reason: msg,
      batches_run: 0,
    };
  }
}

function readExistingPersona(cfg: PersonaConfig, login: string): string | null {
  const path = join(cfg.output_dir, `${login}.md`);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf-8");
}

function writePersonaFile(cfg: PersonaConfig, login: string, content: string): void {
  const path = join(cfg.output_dir, `${login}.md`);
  writeFileSync(path, content);
}
