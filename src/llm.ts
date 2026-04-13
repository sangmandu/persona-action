import Anthropic from "@anthropic-ai/sdk";
import { spawnSync } from "node:child_process";

export interface CompleteOpts {
  system: string;
  user: string;
  model: string;
  maxTokens: number;
}

export interface LlmClient {
  complete(opts: CompleteOpts): Promise<string>;
}

export class AnthropicSdkClient implements LlmClient {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : {});
  }

  async complete(opts: CompleteOpts): Promise<string> {
    const res = await this.client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    return res.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }
}

export class ClaudeCliClient implements LlmClient {
  async complete(opts: CompleteOpts): Promise<string> {
    const t0 = Date.now();
    const ts = new Date().toISOString().slice(11, 19);
    process.stderr.write(
      `[${ts}] llm:claude-cli start (model=${opts.model}, user=${opts.user.length}c)\n`,
    );
    const res = spawnSync(
      "claude",
      [
        "-p",
        "--model",
        opts.model,
        "--append-system-prompt",
        opts.system,
      ],
      {
        input: opts.user,
        encoding: "utf-8",
        maxBuffer: 32 * 1024 * 1024,
        timeout: 180_000,
        env: {
          ...process.env,
          CLAUDE_CODE_NO_PROJECT_CONTEXT: "1",
        },
      },
    );
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (res.error && (res.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
      process.stderr.write(`[${ts}] llm:claude-cli TIMEOUT after ${dt}s\n`);
      throw new Error(`claude -p timed out after ${dt}s`);
    }
    if (res.status !== 0) {
      process.stderr.write(`[${ts}] llm:claude-cli FAIL exit=${res.status} dt=${dt}s\n`);
      throw new Error(
        `claude -p failed (exit ${res.status}): ${res.stderr || res.stdout}`,
      );
    }
    process.stderr.write(
      `[${ts}] llm:claude-cli ok ${dt}s (out=${res.stdout.length}c)\n`,
    );
    return res.stdout.trim();
  }
}

export function createClient(): LlmClient {
  const mode = process.env.PERSONA_AUTH_MODE;
  if (mode === "oauth") return new ClaudeCliClient();
  if (mode === "api_key") return new AnthropicSdkClient();
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return new ClaudeCliClient();
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicSdkClient();
  throw new Error(
    "No auth credentials found. Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN.",
  );
}
