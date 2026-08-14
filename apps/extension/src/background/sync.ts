import type { WorkspaceData } from "@tabmind/types";
import { LIMITS } from "@tabmind/config";
import { api, ApiError } from "../shared/api";
import { readState, updateState, writeState } from "../shared/storage";

/**
 * Account sync: batched, debounced, resilient. Local state is the working
 * copy; the server is the durable one. Conflicts resolve by updatedAt.
 */

export async function markWorkspacesDirty(ids: string[]): Promise<void> {
  await updateState("pendingWorkspaceSync", (pending) => ({
    upsertIds: [...new Set([...pending.upsertIds, ...ids])],
    deleteIds: pending.deleteIds,
  }));
}

let flushing = false;

export async function flushSync(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const { auth, prefs } = await readState("auth", "prefs");
    if (!auth || !prefs.syncEnabled || prefs.paused) return;
    await flushWorkspaces();
    if (prefs.historyEnabled) await flushPages();
  } finally {
    flushing = false;
  }
}

async function flushWorkspaces(): Promise<void> {
  const { pendingWorkspaceSync, workspaces } = await readState("pendingWorkspaceSync", "workspaces");
  const { upsertIds, deleteIds } = pendingWorkspaceSync;
  if (upsertIds.length === 0 && deleteIds.length === 0) return;

  const upserts = workspaces.filter((w) => upsertIds.includes(w.id));
  try {
    await api.syncWorkspaces({
      upserts: upserts.map(toPayload),
      deletes: deleteIds,
    });
    await writeState({ pendingWorkspaceSync: { upsertIds: [], deleteIds: [] } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) await handleAuthLoss();
    // Other failures: keep the queue, retry on the next alarm.
  }
}

async function flushPages(): Promise<void> {
  const { localHistory } = await readState("localHistory");
  const pending = localHistory.filter((p) => p.pendingSync).slice(0, LIMITS.syncBatchMax);
  if (pending.length === 0) return;
  try {
    await api.syncPages({
      visits: pending.map((p) => ({
        url: p.url,
        title: p.title,
        domain: p.domain,
        visitedAt: p.lastSeenAt,
      })),
    });
    const sent = new Set(pending.map((p) => p.normalizedUrl));
    await updateState("localHistory", (history) =>
      history.map((p) => (sent.has(p.normalizedUrl) ? { ...p, pendingSync: false } : p)),
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) await handleAuthLoss();
  }
}

/** Pull server workspaces on sign-in / periodically; newest updatedAt wins. */
export async function pullWorkspaces(): Promise<void> {
  const { auth, prefs } = await readState("auth", "prefs");
  if (!auth || !prefs.syncEnabled) return;
  try {
    const { workspaces: remote } = await api.pullWorkspaces();
    await updateState("workspaces", (local) => {
      const byId = new Map<string, WorkspaceData>();
      for (const w of local) byId.set(w.id, w);
      for (const w of remote) {
        const existing = byId.get(w.id);
        if (!existing || w.updatedAt > existing.updatedAt) byId.set(w.id, w);
      }
      return [...byId.values()].sort((a, b) => a.position - b.position);
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) await handleAuthLoss();
  }
}

async function handleAuthLoss(): Promise<void> {
  // Token revoked or expired: sign out locally, keep all local data.
  await writeState({ auth: null });
}

function toPayload(w: WorkspaceData) {
  return {
    id: w.id,
    title: w.title,
    summary: w.summary,
    kind: w.kind,
    state: w.state,
    color: w.color,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    lastActiveAt: w.lastActiveAt,
    position: w.position,
    tabs: w.tabs.map((t) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      domain: t.domain,
      faviconUrl: t.faviconUrl?.startsWith("http") ? t.faviconUrl : undefined,
      pinned: t.pinned,
      position: t.position,
      note: t.note,
      addedAt: t.addedAt,
    })),
  };
}
