import { readFileSync, existsSync } from "node:fs";
import { parse as parseYaml } from "yaml";

export interface ContributorConfig {
  login: string;
  start_from_pr?: number;
  start_from_date?: string;
}

export interface PersonaConfig {
  source_repo: string;
  contributors: ContributorConfig[];
  batch_size: number;
  min_prs_to_update: number;
  max_prs_per_run: number;
  output_dir: string;
  state_file: string;
  paths?: {
    include?: string[];
    exclude?: string[];
  };
  model: string;
}

const DEFAULTS = {
  batch_size: 20,
  min_prs_to_update: 20,
  max_prs_per_run: 100,
  output_dir: ".claude/agents",
  state_file: ".claude/agents/state.json",
  model: "claude-sonnet-4-5",
} as const;

export function loadConfig(path: string): PersonaConfig {
  if (!existsSync(path)) {
    throw new Error(`Config file not found: ${path}`);
  }
  const raw = parseYaml(readFileSync(path, "utf-8")) as Record<string, unknown>;

  const source_repo = raw.source_repo as string | undefined;
  if (!source_repo || !/^[^/]+\/[^/]+$/.test(source_repo)) {
    throw new Error(`config.source_repo must be "owner/repo", got: ${source_repo}`);
  }

  const rawContribs = raw.contributors;
  if (!Array.isArray(rawContribs) || rawContribs.length === 0) {
    throw new Error("config.contributors must be a non-empty array");
  }

  const contributors: ContributorConfig[] = rawContribs.map((c) => {
    if (typeof c === "string") return { login: c };
    if (typeof c === "object" && c !== null && "login" in c) {
      return c as ContributorConfig;
    }
    throw new Error(`Invalid contributor entry: ${JSON.stringify(c)}`);
  });

  return {
    source_repo,
    contributors,
    batch_size: (raw.batch_size as number) ?? DEFAULTS.batch_size,
    min_prs_to_update: (raw.min_prs_to_update as number) ?? DEFAULTS.min_prs_to_update,
    max_prs_per_run: (raw.max_prs_per_run as number) ?? DEFAULTS.max_prs_per_run,
    output_dir: (raw.output_dir as string) ?? DEFAULTS.output_dir,
    state_file: (raw.state_file as string) ?? DEFAULTS.state_file,
    paths: raw.paths as PersonaConfig["paths"],
    model: (raw.model as string) ?? DEFAULTS.model,
  };
}
