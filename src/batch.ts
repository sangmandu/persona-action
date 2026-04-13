import type { PrSummary } from "./fetch.ts";

export interface Batch {
  index: number;
  prs: PrSummary[];
  lastPrNumber: number;
}

export interface BatchPlan {
  full_batches: Batch[];
  leftover: PrSummary[]; // held back to next run
  skipped: boolean;
  reason?: string;
}

export function planBatches(
  newPrs: PrSummary[],
  batchSize: number,
  minToUpdate: number,
  maxPerRun: number,
): BatchPlan {
  if (newPrs.length < minToUpdate) {
    return {
      full_batches: [],
      leftover: newPrs,
      skipped: true,
      reason: `only ${newPrs.length} new PRs (threshold ${minToUpdate})`,
    };
  }

  const fullCount = Math.floor(newPrs.length / batchSize);
  const capBatches = Math.floor(maxPerRun / batchSize);
  const take = Math.min(fullCount, capBatches);

  const batches: Batch[] = [];
  for (let i = 0; i < take; i++) {
    const slice = newPrs.slice(i * batchSize, (i + 1) * batchSize);
    const lastOne = slice[slice.length - 1];
    batches.push({
      index: i,
      prs: slice,
      lastPrNumber: lastOne ? lastOne.number : 0,
    });
  }

  const leftover = newPrs.slice(take * batchSize);
  return { full_batches: batches, leftover, skipped: false };
}

export function groupPrsForLevel1(prs: PrSummary[], groupSize = 5): PrSummary[][] {
  const groups: PrSummary[][] = [];
  for (let i = 0; i < prs.length; i += groupSize) {
    groups.push(prs.slice(i, i + groupSize));
  }
  return groups;
}
