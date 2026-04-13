import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PersonaConfig } from "./config.ts";
import type { ContributorState, PersonaState } from "./state.ts";
import { loadState, saveState } from "./state.ts";
import { listMergedPrs, resolveStartPr } from "./fetch.ts";
import { planBatches, groupPrsForLevel1 } from "./batch.ts";
import {
  analyzeGroup,
  synthesizeBatchPersona,
  driftMerge,
} from "./analyze.ts";
import { validatePersona } from "./validate.ts";

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
  log(`run start — ${cfg.contributors.length} contributors, model=${cfg.model}`);

  const summaries: RunSummary[] = [];

  for (const contrib of cfg.contributors) {
    const login = contrib.login;
    log(`[${login}] begin`);
    let cState = state.contributors[login];

    // Bootstrap on first encounter
    if (!cState) {
      const startPr = resolveStartPr(
        cfg.source_repo,
        login,
        contrib.start_from_pr,
        contrib.start_from_date,
      );
      cState = {
        last_pr_number: startPr,
        batches_processed: 0,
        persona_version: 0,
        updated_at: new Date().toISOString().slice(0, 10),
      };
      state.contributors[login] = cState;
    }

    // Fetch new PRs
    log(`[${login}] listing merged PRs since #${cState.last_pr_number}`);
    const newPrs = listMergedPrs(
      cfg.source_repo,
      login,
      cState.last_pr_number,
      cfg.max_prs_per_run + 50,
    );
    log(`[${login}] found ${newPrs.length} new PRs`);

    const plan = planBatches(
      newPrs,
      cfg.batch_size,
      cfg.min_prs_to_update,
      cfg.max_prs_per_run,
    );

    if (plan.skipped) {
      log(`[${login}] skipped — ${plan.reason}`);
      summaries.push({
        contributor: login,
        status: "skipped",
        reason: plan.reason,
        batches_run: 0,
      });
      continue;
    }

    log(`[${login}] planned ${plan.full_batches.length} batch(es)`);
    try {
      const updated = await processBatches(cfg, login, cState, plan.full_batches);
      state.contributors[login] = updated.state;

      const validation = validatePersona(updated.finalPersona);
      if (!validation.ok) {
        summaries.push({
          contributor: login,
          status: "failed",
          reason: "validation failed",
          validation_errors: validation.errors,
          batches_run: plan.full_batches.length,
        });
        continue;
      }

      writePersonaFile(cfg, login, updated.finalPersona);
      log(`[${login}] updated ok — last_pr=${updated.state.last_pr_number}, batches=${plan.full_batches.length}`);
      summaries.push({
        contributor: login,
        status: "updated",
        batches_run: plan.full_batches.length,
        new_last_pr: updated.state.last_pr_number,
      });
    } catch (e) {
      log(`[${login}] FAILED — ${(e as Error).message.slice(0, 200)}`);
      summaries.push({
        contributor: login,
        status: "failed",
        reason: (e as Error).message,
        batches_run: 0,
      });
    }
  }

  saveState(cfg.state_file, state);
  log(`run complete — saved state to ${cfg.state_file}`);
  return summaries;
}

async function processBatches(
  cfg: PersonaConfig,
  login: string,
  startState: ContributorState,
  batches: { prs: Parameters<typeof analyzeGroup>[0]; lastPrNumber: number }[],
): Promise<{ state: ContributorState; finalPersona: string }> {
  let currentState = { ...startState };
  let currentPersona = readExistingPersona(cfg, login);

  let batchIdx = 0;
  for (const batch of batches) {
    batchIdx++;
    const groups = groupPrsForLevel1(batch.prs, 5);
    log(`[${login}] batch ${batchIdx}/${batches.length} — ${batch.prs.length} PRs in ${groups.length} groups`);
    const memos: string[] = [];
    let gi = 0;
    for (const group of groups) {
      gi++;
      const prNums = group.map((p) => `#${p.number}`).join(",");
      log(`[${login}]   group ${gi}/${groups.length} (${prNums}) — analyzing`);
      const memo = await analyzeGroup(group, {
        repo: cfg.source_repo,
        login,
        model: cfg.model,
      });
      log(`[${login}]   group ${gi}/${groups.length} done (${memo.length} chars)`);
      memos.push(memo);
    }

    const nextMeta = {
      persona_version: currentState.persona_version + 1,
      last_pr_number: batch.lastPrNumber,
      batch_count: currentState.batches_processed + 1,
      updated_at: new Date().toISOString().slice(0, 10),
    };

    log(`[${login}]   batch ${batchIdx} — synthesizing persona from ${memos.length} memos`);
    const batchPersona = await synthesizeBatchPersona(memos, {
      repo: cfg.source_repo,
      login,
      model: cfg.model,
      meta: nextMeta,
    });
    log(`[${login}]   batch ${batchIdx} — synthesis done (${batchPersona.length} chars)`);

    if (currentPersona) {
      log(`[${login}]   batch ${batchIdx} — drift merging with existing persona`);
      const { persona } = await driftMerge(currentPersona, batchPersona, {
        repo: cfg.source_repo,
        login,
        model: cfg.model,
        meta: nextMeta,
      });
      currentPersona = persona;
      log(`[${login}]   batch ${batchIdx} — drift merge done`);
    } else {
      currentPersona = batchPersona;
    }

    currentState = {
      last_pr_number: batch.lastPrNumber,
      batches_processed: currentState.batches_processed + 1,
      persona_version: nextMeta.persona_version,
      updated_at: nextMeta.updated_at,
    };
  }

  return { state: currentState, finalPersona: currentPersona ?? "" };
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
