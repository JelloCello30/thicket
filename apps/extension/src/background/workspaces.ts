import type { AnalysisResult, WorkspaceData, WorkspaceTabData } from "@tabmind/types";
import { entitlementsFor } from "@tabmind/config";
import { readState, updateState, writeState, type ClosedBatch } from "../shared/storage";
import { faviconFor } from "./tabs";
import { recordClosed } from "./history";
import { markWorkspacesDirty } from "./sync";
import { scheduleAnalysis } from "./analyzer";
import { track } from "./analytics";

/** Save/close/restore — the "close everything without losing anything" core. */

export class LimitError extends Error {
  code = "pro-required" as const;
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export async function saveWorkspaceFromGroup(
  analysis: AnalysisResult,
  groupId: string,
): Promise<WorkspaceData> {
  const group = analysis.groups.find((g) => g.id === groupId);
  if (!group) throw new Error("That group is gone — tabs may have changed.");
  const byId = new Map(analysis.tabs.map((t) => [t.tabId, t]));

  const { workspaces, auth } = await readState("workspaces", "auth");
  const existing = workspaces.find((w) => w.id === group.savedWorkspaceId);

  if (!existing) {
    const plan = auth?.user.plan ?? "free";
    const cap = entitlementsFor(plan).maxWorkspaces;
    const activeCount = workspaces.length;
    if (cap != null && activeCount >= cap) {
      throw new LimitError(
        auth
          ? `The free plan keeps ${cap} workspaces. Upgrade to Pro for unlimited.`
          : `You've reached ${cap} saved workspaces. Sign in and upgrade to Pro for unlimited.`,
      );
    }
  }

  const now = Date.now();
  const tabs: WorkspaceTabData[] = group.tabIds
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t) && !t!.excluded)
    .map((t, index) => ({
      id: newId("wt"),
      url: t.url,
      title: t.title,
      domain: t.domain,
      faviconUrl: faviconFor(t.url),
      pinned: t.pinned,
      position: index,
      addedAt: now,
    }));
  if (tabs.length === 0) throw new Error("Nothing in this group can be saved.");

  const workspace: WorkspaceData = existing
    ? {
        ...existing,
        title: existing.title,
        tabs: mergeTabs(existing.tabs, tabs),
        updatedAt: now,
        lastActiveAt: now,
      }
    : {
        id: newId("ws"),
        title: group.name,
        summary: group.insight?.text,
        kind: group.kind,
        state: "active",
        color: group.color,
        tabs,
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
        position: workspaces.length,
        originGroupId: group.id,
      };

  await updateState("workspaces", (all) => [
    ...all.filter((w) => w.id !== workspace.id),
    workspace,
  ]);
  await markWorkspacesDirty([workspace.id]);
  track("workspace_saved", { tabs: tabs.length });
  scheduleAnalysis("workspace-saved");
  return workspace;
}

function mergeTabs(existing: WorkspaceTabData[], incoming: WorkspaceTabData[]): WorkspaceTabData[] {
  const byUrl = new Map(existing.map((t) => [t.url, t]));
  for (const tab of incoming) {
    if (!byUrl.has(tab.url)) byUrl.set(tab.url, tab);
  }
  return [...byUrl.values()].map((t, i) => ({ ...t, position: i }));
}

export async function closeTabs(
  tabIds: number[],
  label: string,
  groupName?: string,
): Promise<{ closedCount: number; undoBatchId: string }> {
  const tabs = await chrome.tabs.query({ windowType: "normal" });
  const closable = tabs.filter((t) => t.id != null && tabIds.includes(t.id));
  const batch: ClosedBatch = {
    id: newId("undo"),
    label,
    tabs: closable
      .filter((t) => t.url && !t.url.startsWith("chrome"))
      .map((t) => ({ url: t.url!, title: t.title ?? t.url! })),
    at: Date.now(),
  };

  for (const tab of closable) {
    await recordClosed(tab.id!, groupName);
  }
  const ids = closable.map((t) => t.id!) as number[];
  if (ids.length > 0) await chrome.tabs.remove(ids);

  await updateState("closedBatches", (batches) => [batch, ...batches].slice(0, 10));
  scheduleAnalysis("tabs-closed");
  return { closedCount: ids.length, undoBatchId: batch.id };
}

export async function undoBatch(batchId: string): Promise<number> {
  const { closedBatches } = await readState("closedBatches");
  const batch = closedBatches.find((b) => b.id === batchId);
  if (!batch) return 0;
  for (const tab of batch.tabs) {
    await chrome.tabs.create({ url: tab.url, active: false });
  }
  await updateState("closedBatches", (batches) => batches.filter((b) => b.id !== batchId));
  scheduleAnalysis("undo");
  return batch.tabs.length;
}

export async function restoreWorkspace(workspaceId: string): Promise<number> {
  const { workspaces } = await readState("workspaces");
  const workspace = workspaces.find((w) => w.id === workspaceId);
  if (!workspace) throw new Error("Workspace not found.");
  if (workspace.tabs.length === 0) return 0;

  // Reuse tabs that are already open; open the rest, grouped natively.
  const open = await chrome.tabs.query({ windowType: "normal" });
  const openUrls = new Set(open.map((t) => t.url));
  const toOpen = workspace.tabs
    .slice()
    .sort((a, b) => a.position - b.position)
    .filter((t) => !openUrls.has(t.url));

  const created: number[] = [];
  for (const tab of toOpen) {
    const createdTab = await chrome.tabs.create({ url: tab.url, active: false });
    if (createdTab.id != null) created.push(createdTab.id);
  }
  if (created.length >= 2) {
    try {
      const chromeGroupId = await chrome.tabs.group({ tabIds: created as [number, ...number[]] });
      await chrome.tabGroups.update(chromeGroupId, { title: workspace.title });
    } catch {
      /* grouping is cosmetic */
    }
  }

  const now = Date.now();
  await updateState("workspaces", (all) =>
    all.map((w) => (w.id === workspaceId ? { ...w, lastActiveAt: now, state: "active" as const } : w)),
  );
  await markWorkspacesDirty([workspaceId]);
  track("workspace_restored", { tabs: workspace.tabs.length, opened: created.length });
  scheduleAnalysis("workspace-restored");
  return created.length;
}

export async function setWorkspaceState(workspaceId: string, state: "active" | "archived"): Promise<void> {
  await updateState("workspaces", (all) =>
    all.map((w) => (w.id === workspaceId ? { ...w, state, updatedAt: Date.now() } : w)),
  );
  await markWorkspacesDirty([workspaceId]);
}

export async function renameWorkspace(workspaceId: string, title: string): Promise<void> {
  const clean = title.trim().slice(0, 120);
  if (!clean) return;
  await updateState("workspaces", (all) =>
    all.map((w) => (w.id === workspaceId ? { ...w, title: clean, updatedAt: Date.now() } : w)),
  );
  await markWorkspacesDirty([workspaceId]);
}

export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await updateState("workspaces", (all) => all.filter((w) => w.id !== workspaceId));
  const { pendingWorkspaceSync } = await readState("pendingWorkspaceSync");
  await writeState({
    pendingWorkspaceSync: {
      upsertIds: pendingWorkspaceSync.upsertIds.filter((id) => id !== workspaceId),
      deleteIds: [...new Set([...pendingWorkspaceSync.deleteIds, workspaceId])],
    },
  });
}
