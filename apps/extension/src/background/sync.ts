import type { WorkspaceData } from "@thicket/types";
import { LIMITS } from "@thicket/config";
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

/**
 * Ask the configured server what it supports. Cheap, cached for an hour, and
 * failure is meaningful: a static deployment (or no server) simply never
 * answers, which correctly leaves the paid tier hidden.
 */
export async function refreshCapabilities(force = false): Promise<void> {
  // Local-only build: there is no server to ask, and asking would be an
  // outbound request on every install and every hour — the one thing the
  // listing promises does not happen.
  if (__LOCAL_ONLY__) return;
  const { capabilitiesCheckedAt } = await readState("capabilitiesCheckedAt");
  if (!force && Date.now() - capabilitiesCheckedAt < 60 * 60_000) return;
  try {
    const caps = await api.capabilities();
    await writeState({
      capabilities: {
        accounts: Boolean(caps.accounts),
        ai: Boolean(caps.ai),
        embeddings: Boolean(caps.embeddings),
        billing: Boolean(caps.billing),
      },
      capabilitiesCheckedAt: Date.now(),
    });
  } catch {
    // No server, or offline. Keep the last known answer; if there never was
    // one this stays all-false, which is the honest default.
    await writeState({ capabilitiesCheckedAt: Date.now() });
  }
}

let flushing = false;

export async function flushSync(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await refreshCapabilities();
    const { auth, prefs } = await readState("auth", "prefs");
    if (!auth) return;
    await refreshAccount();
    // Deletions are privacy actions: they propagate even when sync is off.
    await flushPageDeletes();
    if (!prefs.syncEnabled || prefs.paused) return;
    await flushWorkspaces();
    if (prefs.historyEnabled) await flushPages();
  } finally {
    flushing = false;
  }
}

/**
 * Re-read the account from the server. The plan was captured once at link
 * time and never looked at again, so someone who upgraded on the web kept
 * hitting free limits in the extension until they unlinked and relinked —
 * paying without receiving anything. Cheap, and it rides the existing sync.
 */
export async function refreshAccount(): Promise<void> {
  const { auth } = await readState("auth");
  if (!auth) return;
  try {
    const result = await api.me();
    if (result.user.plan === auth.user.plan && result.user.email === auth.user.email) return;
    await writeState({ auth: { ...auth, user: result.user } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) await handleAuthLoss();
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

export async function flushPageDeletes(): Promise<void> {
  const { auth, pendingPageDeletes } = await readState("auth", "pendingPageDeletes");
  if (!auth || pendingPageDeletes.length === 0) return;
  try {
    if (pendingPageDeletes.includes("*")) {
      await api.deletePages({ all: true });
      await writeState({ pendingPageDeletes: [] });
    } else {
      const batch = pendingPageDeletes.slice(0, 100);
      await api.deletePages({ urls: batch });
      const sent = new Set(batch);
      await updateState("pendingPageDeletes", (queue) => queue.filter((u) => !sent.has(u)));
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) await handleAuthLoss();
    // Other failures: the queue stays; the next sync alarm retries.
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
