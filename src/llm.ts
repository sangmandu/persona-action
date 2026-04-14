import Anthropic from "@anthropic-ai/sdk";
import { spawn, spawnSync } from "node:child_process";

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
  complete(opts: CompleteOpts): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const t0 = Date.now();
      const ts = new Date().toISOString().slice(11, 19);
      process.stderr.write(
        `[${ts}] llm:claude-cli start (model=${opts.model}, user=${opts.user.length}c)\n`,
      );
      const child = spawn(
        "claude",
        ["-p", "--model", opts.model, "--system-prompt", opts.system],
        {
          env: {
            ...process.env,
            CLAUDE_CODE_NO_PROJECT_CONTEXT: "1",
          },
        },
      );
      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        process.stderr.write(`[${ts}] llm:claude-cli TIMEOUT after ${dt}s\n`);
        reject(new Error(`claude -p timed out after ${dt}s`));
      }, 300_000);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf-8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf-8");
      });
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const dt = ((Date.now() - t0) / 1000).toFixed(1);
        if (code !== 0) {
          process.stderr.write(
            `[${ts}] llm:claude-cli FAIL exit=${code} dt=${dt}s\n`,
          );
          reject(
            new Error(
              `claude -p failed (exit ${code}): ${stderr || stdout}`,
            ),
          );
          return;
        }
        process.stderr.write(
          `[${ts}] llm:claude-cli ok ${dt}s (out=${stdout.length}c)\n`,
        );
        resolve(stdout.trim());
      });

      child.stdin.write(opts.user);
      child.stdin.end();
    });
  }
}

export function createClient(): LlmClient {
  const mode = process.env.PERSONA_AUTH_MODE;
  if (mode === "oauth") return new ClaudeCliClient();
  if (mode === "api_key") return new AnthropicSdkClient();
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return new ClaudeCliClient();
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicSdkClient();
  // Local dev fallback: claude CLI may be authenticated via ~/.claude session
  // without any env var set. Probe for the binary and use it if present.
  const probe = spawnSync("claude", ["--version"], { stdio: "ignore" });
  if (probe.status === 0) return new ClaudeCliClient();
  throw new Error(
    "No auth credentials found. Set ANTHROPIC_API_KEY, CLAUDE_CODE_OAUTH_TOKEN, or install claude CLI.",
  );
}
