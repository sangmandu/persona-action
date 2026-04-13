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
        env: {
          ...process.env,
          CLAUDE_CODE_NO_PROJECT_CONTEXT: "1",
        },
      },
    );
    if (res.status !== 0) {
      throw new Error(
        `claude -p failed (exit ${res.status}): ${res.stderr || res.stdout}`,
      );
    }
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
