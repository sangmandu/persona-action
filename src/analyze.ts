import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { PrSummary } from "./fetch.ts";
import { fetchPrDiff } from "./fetch.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = resolve(__dirname, "..", "prompts");

const client = new Anthropic();

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

/**
 * Level 1: analyze a group of ~5 PRs and return a short memo.
 */
export async function analyzeGroup(
  prs: PrSummary[],
  opts: AnalyzeOpts,
): Promise<string> {
  const prompt = fillTemplate(loadPrompt("group-analysis.md"), {
    login: opts.login,
  });

  const diffs = prs
    .map((p) => {
      const diff = fetchPrDiff(opts.repo, p.number);
      return `## PR #${p.number} — ${p.title}\n\n\`\`\`diff\n${diff}\n\`\`\``;
    })
    .join("\n\n");

  const res = await client.messages.create({
    model: opts.model,
    max_tokens: 2000,
    system: prompt,
    messages: [
      {
        role: "user",
        content: `다음은 ${opts.login}의 merged PR ${prs.length}개이다. 메모를 작성하라.\n\n${diffs}`,
      },
    ],
  });

  return textOf(res);
}

/**
 * Level 2: synthesize 4 group memos into one full persona markdown for this batch.
 */
export async function synthesizeBatchPersona(
  memos: string[],
  opts: AnalyzeOpts & {
    meta: {
      persona_version: number;
      last_pr_number: number;
      batch_count: number;
      updated_at: string;
    };
  },
): Promise<string> {
  const prompt = fillTemplate(loadPrompt("batch-synthesis.md"), {
    login: opts.login,
    meta_json: JSON.stringify(opts.meta),
  });

  const template = readFileSync(
    resolve(__dirname, "..", "templates", "style.md"),
    "utf-8",
  );

  const res = await client.messages.create({
    model: opts.model,
    max_tokens: 8000,
    system: prompt,
    messages: [
      {
        role: "user",
        content: [
          `# Template\n\n${template}`,
          `# Meta\n\n\`\`\`json\n${JSON.stringify(opts.meta, null, 2)}\n\`\`\``,
          `# Group memos\n\n${memos.map((m, i) => `## Group ${i + 1}\n\n${m}`).join("\n\n")}`,
        ].join("\n\n"),
      },
    ],
  });

  return textOf(res);
}

/**
 * Level 3: merge an existing persona with a fresh batch persona.
 */
export async function driftMerge(
  currentPersona: string,
  newBatchPersona: string,
  opts: AnalyzeOpts & {
    meta: {
      persona_version: number;
      last_pr_number: number;
      batch_count: number;
      updated_at: string;
    };
  },
): Promise<{ persona: string; changes: string }> {
  const prompt = fillTemplate(loadPrompt("persona-drift-merge.md"), {
    login: opts.login,
  });

  const res = await client.messages.create({
    model: opts.model,
    max_tokens: 8000,
    system: prompt,
    messages: [
      {
        role: "user",
        content: [
          `# Current persona (v${opts.meta.persona_version - 1})\n\n${currentPersona}`,
          `# New batch persona\n\n${newBatchPersona}`,
          `# New meta\n\n\`\`\`json\n${JSON.stringify(opts.meta, null, 2)}\n\`\`\``,
        ].join("\n\n"),
      },
    ],
  });

  const out = textOf(res);
  const [persona, changes = ""] = out.split(/\n---\n/, 2);
  return { persona: persona ?? "", changes };
}

function textOf(res: Anthropic.Messages.Message): string {
  return res.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
