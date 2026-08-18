import type { AnalysisResult, WorkspaceData, WorkspaceTabData } from "@thicket/types";
import { entitlementsFor } from "@thicket/config";
import { rememberMirroredGroup } from "./mirror";
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

  /**
   * The workspace cap only means something when there is a plan to upgrade to.
   * With no account and no server, every workspace is a few KB in this
   * browser's own storage — capping it would block the product's central
   * promise ("close it, we'll remember it") to sell something that does not
   * exist. Restored when accounts ship.
   */
  const { capabilities } = await readState("capabilities");
  if (!existing && capabilities.billing) {
    const plan = auth?.user.plan ?? "free";
    const cap = entitlementsFor(plan).maxWorkspaces;
    if (cap != null && workspaces.length >= cap) {
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

  // Capture each tab's group identity so an undo puts it back where it was.
  const { readCached } = await import("./analyzer");
  const analysis = await readCached();
  const groupOf = (tabId: number) => analysis?.groups.find((g) => g.tabIds.includes(tabId));

  const batch: ClosedBatch = {
    id: newId("undo"),
    label,
    tabs: closable
      .filter((t) => t.url && !t.url.startsWith("chrome"))
      .map((t) => {
        const group = groupOf(t.id!);
        return {
          url: t.url!,
          title: t.title ?? t.url!,
          groupId: group?.id,
          groupName: group?.name,
          groupColor: group?.color,
        };
      }),
    at: Date.now(),
  };

  for (const tab of closable) {
    const group = groupOf(tab.id!);
    await recordClosed(tab.id!, group?.name ?? groupName, group?.id);
  }
  const ids = closable.map((t) => t.id!) as number[];
  if (ids.length > 0) await chrome.tabs.remove(ids);

  await updateState("closedBatches", (batches) => [batch, ...batches].slice(0, 10));
  scheduleAnalysis("tabs-closed");
  return { closedCount: ids.length, undoBatchId: batch.id };
}

/** Pin reopened URLs to the group they came from, so re-analysis lands them home. */
export async function lockUrlsToGroup(urls: string[], groupId: string): Promise<void> {
  const { normalizeUrl } = await import("@thicket/core");
  await updateState("corrections", (corrections) => {
    const locks = { ...corrections.locks };
    for (const url of urls) locks[normalizeUrl(url)] = groupId;
    // Bounded: keep the most recent 200 locks.
    const entries = Object.entries(locks);
    return {
      ...corrections,
      locks: Object.fromEntries(entries.slice(Math.max(0, entries.length - 200))),
    };
  });
}

export async function undoBatch(batchId: string): Promise<number> {
  const { closedBatches } = await readState("closedBatches");
  const batch = closedBatches.find((b) => b.id === batchId);
  if (!batch) return 0;

  // Reopen, remembering which original group each new tab belongs to.
  const byGroup = new Map<string, { name: string; color?: string; createdIds: number[]; urls: string[] }>();
  for (const tab of batch.tabs) {
    const created = await chrome.tabs.create({ url: tab.url, active: false });
    if (tab.groupId && tab.groupName) {
      const entry = byGroup.get(tab.groupId) ?? {
        name: tab.groupName,
        color: tab.groupColor,
        createdIds: [],
        urls: [],
      };
      if (created.id != null) entry.createdIds.push(created.id);
      entry.urls.push(tab.url);
      byGroup.set(tab.groupId, entry);
    }
  }

  // Restore native tab groups immediately (analysis re-confirms right after),
  // and lock the URLs so clustering keeps them in their original group.
  for (const [groupId, entry] of byGroup) {
    await lockUrlsToGroup(entry.urls, groupId);
    if (entry.createdIds.length >= 2) {
      try {
        const chromeGroupId = await chrome.tabs.group({
          tabIds: entry.createdIds as [number, ...number[]],
        });
        await chrome.tabGroups.update(chromeGroupId, {
          title: entry.name,
          color: (entry.color as chrome.tabGroups.ColorEnum) ?? "grey",
        });
        // Claim it. Without this the next analysis finds a native group it
        // doesn't recognise, decides the user made it, and locks it — so the
        // group stops absorbing related tabs and loses its saved link.
        await rememberMirroredGroup(groupId, chromeGroupId);
      } catch {
        /* grouping is cosmetic; the locks still land them correctly */
      }
    }
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
      await chrome.tabGroups.update(chromeGroupId, {
        title: workspace.title,
        color: workspace.color as chrome.tabGroups.ColorEnum,
      });
      // Thicket made this group two seconds ago — claim it, or the next
      // analysis mistakes it for one the user built by hand and freezes it.
      if (workspace.originGroupId) {
        await rememberMirroredGroup(workspace.originGroupId, chromeGroupId);
      }
    } catch {
      /* grouping is cosmetic */
    }
  }
  // Keep the restored tabs together under the workspace's original group
  // identity — analysis then reuses its name and color instead of renaming.
  if (workspace.originGroupId && toOpen.length > 0) {
    await lockUrlsToGroup(
      toOpen.map((t) => t.url),
      workspace.originGroupId,
    );
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
