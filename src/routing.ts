import { parse as parseYaml } from "yaml";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import micromatch from "micromatch";

interface RoutingMeta {
  primary_paths: string[];
  secondary_paths: string[];
  keywords: string[];
}

export interface RoutingResult {
  primary: string[];
  secondary: string[];
  all_matched: string[];
}

function extractRouting(personaMd: string): RoutingMeta | null {
  const m = personaMd.match(/## Review Routing\n+```ya?ml\n([\s\S]*?)\n```/);
  if (!m || !m[1]) return null;
  try {
    const parsed = parseYaml(m[1]) as { review_routing?: Partial<RoutingMeta> };
    const r = parsed?.review_routing ?? {};
    return {
      primary_paths: r.primary_paths ?? [],
      secondary_paths: r.secondary_paths ?? [],
      keywords: r.keywords ?? [],
    };
  } catch {
    return null;
  }
}

function personaLogin(personaMd: string): string | null {
  const m = personaMd.match(/^---\n([\s\S]*?)\n---/);
  if (!m || !m[1]) return null;
  const name = m[1].match(/^name:\s*(\S+)/m);
  if (!name || !name[1]) return null;
  return name[1];
}

/**
 * Given the persona directory and a list of changed file paths (plus optional
 * PR title/body text for keyword matching), return suggested reviewers.
 */
export function routePr(
  personaDir: string,
  changedFiles: string[],
  prText = "",
): RoutingResult {
  if (!existsSync(personaDir)) {
    return { primary: [], secondary: [], all_matched: [] };
  }
  const files = readdirSync(personaDir).filter((f) => f.endsWith(".md"));

  const primaryHits = new Set<string>();
  const secondaryHits = new Set<string>();
  const matchedAny = new Set<string>();

  for (const f of files) {
    const md = readFileSync(join(personaDir, f), "utf-8");
    const login = personaLogin(md);
    if (!login) continue;
    const routing = extractRouting(md);
    if (!routing) continue;

    const primaryMatch = changedFiles.some((cf) =>
      micromatch.isMatch(cf, routing.primary_paths, { dot: true }),
    );
    const secondaryMatch = changedFiles.some((cf) =>
      micromatch.isMatch(cf, routing.secondary_paths, { dot: true }),
    );
    const keywordMatch =
      prText.length > 0 &&
      routing.keywords.some((k) => {
        try {
          return new RegExp(k, "i").test(prText);
        } catch {
          return prText.toLowerCase().includes(k.toLowerCase());
        }
      });

    if (primaryMatch) primaryHits.add(login);
    if (secondaryMatch) secondaryHits.add(login);
    if (primaryMatch || secondaryMatch || keywordMatch) matchedAny.add(login);
  }

  return {
    primary: [...primaryHits],
    secondary: [...secondaryHits].filter((l) => !primaryHits.has(l)),
    all_matched: [...matchedAny],
  };
}
