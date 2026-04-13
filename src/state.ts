import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ContributorConfig } from "./config.ts";

export interface ContributorState {
  last_pr_number: number;
  batches_processed: number;
  persona_version: number;
  updated_at: string;
}

export interface PersonaState {
  version: 1;
  contributors: Record<string, ContributorState>;
}

const EMPTY_STATE: PersonaState = { version: 1, contributors: {} };

export function loadState(path: string): PersonaState {
  if (!existsSync(path)) return structuredClone(EMPTY_STATE);
  const raw = JSON.parse(readFileSync(path, "utf-8")) as PersonaState;
  if (raw.version !== 1) {
    throw new Error(`Unsupported state file version: ${raw.version}`);
  }
  return raw;
}

export function saveState(path: string, state: PersonaState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

/**
 * Bootstrap contributor state from config when state file is missing or
 * doesn't yet have this contributor. Resolves start_from_pr / start_from_date
 * into an initial last_pr_number so the first run doesn't re-analyze history.
 */
export function bootstrapContributorState(
  cfg: ContributorConfig,
  resolveStartPr: (cfg: ContributorConfig) => Promise<number>,
): Promise<ContributorState> {
  return (async () => ({
    last_pr_number: await resolveStartPr(cfg),
    batches_processed: 0,
    persona_version: 0,
    updated_at: new Date().toISOString().slice(0, 10),
  }))();
}

export function getOrBootstrap(
  state: PersonaState,
  cfg: ContributorConfig,
): ContributorState | null {
  return state.contributors[cfg.login] ?? null;
}
