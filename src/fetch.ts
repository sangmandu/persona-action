import { execSync } from "node:child_process";

export interface PrSummary {
  number: number;
  title: string;
  body: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  mergedAt: string;
  author: { login: string };
}

export interface PrWithDiff extends PrSummary {
  diff: string;
}

function gh(args: string[]): string {
  return execSync(`gh ${args.map(shellQuote).join(" ")}`, {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_\-./=:@,]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Fetch merged PRs by author, newest first. Returns summaries only (no diff body).
 * Caller passes `afterPrNumber` to skip already-processed PRs.
 */
export function listMergedPrs(
  repo: string,
  login: string,
  afterPrNumber: number,
  hardCap: number,
): PrSummary[] {
  const json = gh([
    "pr",
    "list",
    "--repo",
    repo,
    "--author",
    login,
    "--state",
    "merged",
    "--limit",
    String(hardCap + 50), // fetch a bit extra so we can filter
    "--json",
    "number,title,body,additions,deletions,changedFiles,mergedAt,author",
  ]);
  const prs = JSON.parse(json) as PrSummary[];
  return prs
    .filter((p) => p.number > afterPrNumber)
    .sort((a, b) => a.number - b.number) // oldest first within new window
    .slice(0, hardCap);
}

export function fetchPrDiff(repo: string, num: number, maxChars = 12000): string {
  const raw = gh(["pr", "diff", String(num), "--repo", repo]);
  if (raw.length <= maxChars) return raw;
  return raw.slice(0, maxChars) + `\n... [truncated: diff was ${raw.length} chars]`;
}

/**
 * Resolve the starting PR number for bootstrap. If start_from_pr set, use it.
 * If start_from_date set, binary-walk merged PRs to find the cutoff. Else 0.
 */
export function resolveStartPr(
  repo: string,
  login: string,
  start_from_pr?: number,
  start_from_date?: string,
): number {
  if (start_from_pr !== undefined) return start_from_pr;
  if (!start_from_date) return 0;

  const json = gh([
    "pr",
    "list",
    "--repo",
    repo,
    "--author",
    login,
    "--state",
    "merged",
    "--limit",
    "1000",
    "--json",
    "number,mergedAt",
  ]);
  const prs = JSON.parse(json) as { number: number; mergedAt: string }[];
  const cutoff = new Date(start_from_date).getTime();
  const before = prs.filter((p) => new Date(p.mergedAt).getTime() < cutoff);
  if (before.length === 0) return 0;
  return Math.max(...before.map((p) => p.number));
}
