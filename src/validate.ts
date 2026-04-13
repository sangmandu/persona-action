import { parse as parseYaml } from "yaml";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    total_lines: number;
    code_style_ratio: number;
    meta_ratio: number;
    pr_citations: number;
    sub_sections: number;
    anti_patterns: number;
  };
}

const REQUIRED_FRONTMATTER = ["name", "description", "tools", "model"];

export function validatePersona(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    errors.push("Missing YAML frontmatter");
    return failure(errors, warnings);
  }
  const [, fmRaw, body] = fmMatch;
  if (!fmRaw || !body) {
    errors.push("Invalid frontmatter/body split");
    return failure(errors, warnings);
  }

  let fm: Record<string, unknown>;
  try {
    fm = parseYaml(fmRaw) as Record<string, unknown>;
  } catch (e) {
    errors.push(`Frontmatter YAML parse error: ${(e as Error).message}`);
    return failure(errors, warnings);
  }

  for (const field of REQUIRED_FRONTMATTER) {
    if (!(field in fm)) errors.push(`Missing frontmatter field: ${field}`);
  }

  // 2. required sections
  const sections = {
    scope: /^## Scope of Work/m.test(body),
    principles: /^## Core Principles/m.test(body),
    code_style: /^## Coding Style/m.test(body),
    checkpoints: /^## Review Checkpoints/m.test(body),
    anti: /^## Anti-patterns/m.test(body),
    routing: /^## Review Routing/m.test(body),
  };
  for (const [k, present] of Object.entries(sections)) {
    if (!present) errors.push(`Missing section: ${k}`);
  }

  // 3. sub-section count inside Coding Style
  const codeStyleBlock = sliceSection(body, "## Coding Style", "## ");
  const subSections = [...codeStyleBlock.matchAll(/^### .+$/gm)].length;
  if (subSections < 8) {
    errors.push(`Code style sub-sections: ${subSections} (need >=8)`);
  }

  // 4. PR citation density
  const citations = [...codeStyleBlock.matchAll(/#(\d+)/g)].length;
  if (citations < 12) {
    errors.push(`PR citations in Coding Style: ${citations} (need >=12)`);
  }

  // 5. total length
  const lines = body.split("\n").length;
  if (lines < 120) warnings.push(`Short persona: ${lines} lines`);
  if (lines > 2500) warnings.push(`Very long persona: ${lines} lines`);

  // 6. meta appendix not dominant
  const metaBlock = sliceSection(body, "## PR Meta (appendix)", "## ");
  const metaLines = metaBlock.split("\n").filter((l) => l.trim()).length;
  const totalNonBlank = body.split("\n").filter((l) => l.trim()).length;
  const metaRatio = metaLines / Math.max(1, totalNonBlank);
  if (metaRatio > 0.05) {
    errors.push(`Meta section too large: ${(metaRatio * 100).toFixed(1)}% (limit 5%)`);
  }

  // 7. review routing completeness
  const routingBlock = sliceSection(body, "## Review Routing", "## ");
  const yamlMatch = routingBlock.match(/```ya?ml\n([\s\S]*?)\n```/);
  let routingOk = false;
  if (yamlMatch && yamlMatch[1]) {
    try {
      const r = parseYaml(yamlMatch[1]) as { review_routing?: Record<string, unknown> };
      const rr = r?.review_routing ?? {};
      const primary = (rr.primary_paths as unknown[] | undefined) ?? [];
      const keywords = (rr.keywords as unknown[] | undefined) ?? [];
      if (primary.length >= 1 && keywords.length >= 3) routingOk = true;
      else
        errors.push(
          `review_routing needs primary_paths>=1 and keywords>=3 (got ${primary.length}/${keywords.length})`,
        );
    } catch (e) {
      errors.push(`review_routing YAML invalid: ${(e as Error).message}`);
    }
  } else {
    errors.push("review_routing: YAML block not found");
  }

  // 8. anti-patterns count
  const antiBlock = sliceSection(body, "## Anti-patterns", "## ");
  const antiItems = [...antiBlock.matchAll(/^\s*-\s+\S/gm)].length;
  if (antiItems < 5) errors.push(`Anti-patterns: ${antiItems} (need >=5)`);

  // 9. coding style block ratio
  const codeStyleLines = codeStyleBlock.split("\n").filter((l) => l.trim()).length;
  const codeRatio = codeStyleLines / Math.max(1, totalNonBlank);
  if (codeRatio < 0.5) {
    warnings.push(`Coding Style ratio ${(codeRatio * 100).toFixed(1)}% (target 65%)`);
  }

  return {
    ok: errors.length === 0 && routingOk,
    errors,
    warnings,
    stats: {
      total_lines: lines,
      code_style_ratio: Number(codeRatio.toFixed(3)),
      meta_ratio: Number(metaRatio.toFixed(3)),
      pr_citations: citations,
      sub_sections: subSections,
      anti_patterns: antiItems,
    },
  };
}

function failure(errors: string[], warnings: string[]): ValidationResult {
  return {
    ok: false,
    errors,
    warnings,
    stats: {
      total_lines: 0,
      code_style_ratio: 0,
      meta_ratio: 0,
      pr_citations: 0,
      sub_sections: 0,
      anti_patterns: 0,
    },
  };
}

function sliceSection(body: string, startHeading: string, stopPrefix: string): string {
  const start = body.indexOf(startHeading);
  if (start === -1) return "";
  const afterStart = start + startHeading.length;
  const rest = body.slice(afterStart);
  const stop = rest.search(new RegExp(`\\n${escapeRegExp(stopPrefix)}`));
  return stop === -1 ? rest : rest.slice(0, stop);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
