import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PrSummary } from "./fetch.ts";
import { fetchPrDiff } from "./fetch.ts";
import { createClient, type LlmClient } from "./llm.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = resolve(__dirname, "..", "prompts");

let _client: LlmClient | null = null;
function client(): LlmClient {
  if (!_client) _client = createClient();
  return _client;
}

function loadPrompt(name: string): string {
  return readFileSync(resolve(PROMPT_DIR, name), "utf-8");
}

function fillTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export interface AnalyzeOpts {
  repo: string;
  login: string;
  model: string;
}

export interface BatchMeta {
  persona_version: number;
  last_pr_number: number;
  batch_count: number;
  updated_at: string;
}

/**
 * Group analysis: analyze a group of ~5 PRs and return a short memo.
 */
export async function analyzeGroup(
  prs: PrSummary[],
  opts: AnalyzeOpts,
): Promise<string> {
  const system = fillTemplate(loadPrompt("group-analysis.md"), {
    login: opts.login,
  });

  const diffs = prs
    .map((p) => {
      const diff = fetchPrDiff(opts.repo, p.number);
      return `## PR #${p.number} — ${p.title}\n\n\`\`\`diff\n${diff}\n\`\`\``;
    })
    .join("\n\n");

  return client().complete({
    model: opts.model,
    maxTokens: 2000,
    system,
    user: `Here are ${prs.length} merged PRs from ${opts.login}. Write the memo.\n\n${diffs}`,
  });
}

/**
 * Batch synthesis: combine 4 group memos into one full persona markdown for this batch.
 */
export async function synthesizeBatchPersona(
  memos: string[],
  opts: AnalyzeOpts & { meta: BatchMeta },
): Promise<string> {
  const system = fillTemplate(loadPrompt("batch-synthesis.md"), {
    login: opts.login,
    meta_json: JSON.stringify(opts.meta),
  });

  const template = readFileSync(
    resolve(__dirname, "..", "templates", "style.md"),
    "utf-8",
  );

  const user = [
    `# Template\n\n${template}`,
    `# Meta\n\n\`\`\`json\n${JSON.stringify(opts.meta, null, 2)}\n\`\`\``,
    `# Group memos\n\n${memos.map((m, i) => `## Group ${i + 1}\n\n${m}`).join("\n\n")}`,
  ].join("\n\n");

  return client().complete({
    model: opts.model,
    maxTokens: 8000,
    system,
    user,
  });
}

/**
 * Drift merge: merge an existing persona with a fresh batch persona.
 */
export async function driftMerge(
  currentPersona: string,
  newBatchPersona: string,
  opts: AnalyzeOpts & { meta: BatchMeta },
): Promise<{ persona: string; changes: string }> {
  const system = fillTemplate(loadPrompt("persona-drift-merge.md"), {
    login: opts.login,
  });

  const user = [
    `# Current persona (v${opts.meta.persona_version - 1})\n\n${currentPersona}`,
    `# New batch persona\n\n${newBatchPersona}`,
    `# New meta\n\n\`\`\`json\n${JSON.stringify(opts.meta, null, 2)}\n\`\`\``,
  ].join("\n\n");

  const out = await client().complete({
    model: opts.model,
    maxTokens: 8000,
    system,
    user,
  });

  const [persona, changes = ""] = out.split(/\n---\n/, 2);
  return { persona: persona ?? "", changes };
}
