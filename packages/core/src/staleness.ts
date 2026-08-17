import type { TabSnapshot } from "@thicket/types";
import { STALENESS } from "@thicket/config";

/**
 * How done is the user with this tab? 0 = clearly in use, 1 = almost
 * certainly finished. Pinned/active/audible tabs are never stale — pinning
 * is an explicit "keep this," and audio means it's in use.
 */
export function stalenessScore(
  tab: Pick<TabSnapshot, "pinned" | "active" | "audible" | "lastAccessed">,
  now: number,
  staleAfterHours: number = STALENESS.staleAfterHours,
): number {
  if (tab.pinned || tab.active || tab.audible) return 0;
  if (tab.lastAccessed == null) return 0.3; // unknown — mildly suspicious, never certain
  const hours = Math.max(0, (now - tab.lastAccessed) / 3_600_000);
  const t = staleAfterHours;
  if (hours <= 1) return 0;
  // Smooth ramp: ~0.35 at `t/2` hours, ~0.7 at `t`, →1 as it ages past 3×t.
  const score = 1 - Math.exp(-hours / t);
  return Math.min(1, score * 1.08);
}
