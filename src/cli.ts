#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { loadConfig } from "./config.ts";
import { runOnce } from "./run.ts";
import { validatePersona } from "./validate.ts";
import { routePr } from "./routing.ts";

const HELP = `persona-action <command> [options]

Commands:
  run --config <path>              Execute one full pipeline pass
  validate <persona.md>            Run quality gate on a persona file
  route --personas <dir> --files <a,b,c> [--text "..."]
                                   Suggest reviewers for a PR
  help                             Show this

Config-driven only. All behavior comes from the YAML config file.
`;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[k] = next;
        i++;
      } else {
        out[k] = true;
      }
    } else if (!out._cmd) {
      out._cmd = a;
    } else if (!out._arg) {
      out._arg = a;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._cmd;

  if (!cmd || cmd === "help" || args.help) {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case "run": {
      const configPath = (args.config as string) ?? ".persona/config.yml";
      const cfg = loadConfig(configPath);
      const summaries = await runOnce(cfg);
      console.log(JSON.stringify(summaries, null, 2));
      const anyFailed = summaries.some((s) => s.status === "failed");
      process.exit(anyFailed ? 1 : 0);
    }

    case "validate": {
      const path = args._arg as string | undefined;
      if (!path) {
        console.error("Usage: persona-action validate <persona.md>");
        process.exit(2);
      }
      const content = readFileSync(path, "utf-8");
      const result = validatePersona(content);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    }

    case "route": {
      const personaDir = (args.personas as string) ?? ".claude/agents";
      const filesRaw = (args.files as string) ?? "";
      const text = (args.text as string) ?? "";
      const files = filesRaw.split(",").map((s) => s.trim()).filter(Boolean);
      const result = routePr(personaDir, files, text);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    default:
      console.error(`Unknown command: ${cmd}`);
      console.error(HELP);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
