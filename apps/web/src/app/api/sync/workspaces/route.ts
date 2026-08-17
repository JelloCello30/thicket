import { and, eq, inArray } from "drizzle-orm";
import { syncWorkspacesRequest, type WorkspaceData } from "@thicket/types";
import { workspace, workspaceTab } from "@thicket/db/schema";
import { RATE_LIMITS } from "@thicket/config";
import { db } from "@/lib/db";
import { corsPreflight, handled, json } from "@/lib/http";
import { HttpError, requireUser } from "@/lib/request-auth";
import { rateLimit } from "@/lib/rate-limit";

export const OPTIONS = corsPreflight();

export const GET = handled(async (request) => {
  const user = await requireUser(request);
  const database = await db();
  const rows = await database
    .select()
    .from(workspace)
    .where(eq(workspace.userId, user.id));
  const ids = rows.map((r) => r.id);
  const tabs = ids.length
    ? await database.select().from(workspaceTab).where(inArray(workspaceTab.workspaceId, ids))
    : [];
  const byWorkspace = new Map<string, typeof tabs>();
  for (const tab of tabs) {
    const list = byWorkspace.get(tab.workspaceId) ?? [];
    list.push(tab);
    byWorkspace.set(tab.workspaceId, list);
  }
  const workspaces: WorkspaceData[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary ?? undefined,
    kind: row.kind as WorkspaceData["kind"],
    state: row.state,
    color: row.color as WorkspaceData["color"],
    position: row.position,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    lastActiveAt: row.lastActiveAt.getTime(),
    tabs: (byWorkspace.get(row.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        domain: tab.domain,
        faviconUrl: tab.faviconUrl ?? undefined,
        pinned: tab.pinned,
        position: tab.position,
        note: tab.note ?? undefined,
        addedAt: tab.addedAt.getTime(),
      })),
  }));
  return json({ workspaces });
});

export const POST = handled(async (request) => {
  const user = await requireUser(request);
  rateLimit(`sync:${user.id}`, RATE_LIMITS.syncPerMinute);
  const parsed = syncWorkspacesRequest.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid sync payload.");
  const { upserts, deletes } = parsed.data;
  const database = await db();

  // Ownership first: nobody writes another account's workspace, whatever
  // their plan. One batched lookup serves the cap check + conflict logic too.
  const upsertIds = upserts.map((w) => w.id);
  const existingRows = upsertIds.length
    ? await database
        .select({ id: workspace.id, updatedAt: workspace.updatedAt, userId: workspace.userId })
        .from(workspace)
        .where(inArray(workspace.id, upsertIds))
    : [];
  for (const row of existingRows) {
    if (row.userId !== user.id) {
      throw new HttpError(403, "forbidden", "Workspace belongs to another account.");
    }
  }
  const existingById = new Map(existingRows.map((r) => [r.id, r]));

  // Server-side cap: free accounts keep 3 workspaces. Count what the account
  // would have after this sync and reject additions beyond the cap.
  if (user.entitlements.maxWorkspaces != null && upserts.length > 0) {
    const mine = await database
      .select({ id: workspace.id })
      .from(workspace)
      .where(eq(workspace.userId, user.id));
    const deleteSet = new Set(deletes);
    const finalIds = new Set(mine.map((r) => r.id).filter((id) => !deleteSet.has(id)));
    for (const w of upserts) finalIds.add(w.id);
    if (finalIds.size > user.entitlements.maxWorkspaces) {
      throw new HttpError(
        402,
        "pro-required",
        `The free plan keeps ${user.entitlements.maxWorkspaces} workspaces. Upgrade to Pro for unlimited.`,
      );
    }
  }

  for (const w of upserts) {
    const record = existingById.get(w.id);
    if (record && record.updatedAt.getTime() >= w.updatedAt) continue; // server copy newer

    await database
      .insert(workspace)
      .values({
        id: w.id,
        userId: user.id,
        title: w.title,
        summary: w.summary ?? null,
        kind: w.kind,
        state: w.state,
        color: w.color,
        position: w.position,
        createdAt: new Date(w.createdAt),
        updatedAt: new Date(w.updatedAt),
        lastActiveAt: new Date(w.lastActiveAt),
      })
      .onConflictDoUpdate({
        target: workspace.id,
        set: {
          title: w.title,
          summary: w.summary ?? null,
          kind: w.kind,
          state: w.state,
          color: w.color,
          position: w.position,
          updatedAt: new Date(w.updatedAt),
          lastActiveAt: new Date(w.lastActiveAt),
        },
      });
    await database.delete(workspaceTab).where(eq(workspaceTab.workspaceId, w.id));
    if (w.tabs.length > 0) {
      await database.insert(workspaceTab).values(
        w.tabs.map((tab) => ({
          id: tab.id,
          workspaceId: w.id,
          url: tab.url,
          title: tab.title,
          domain: tab.domain,
          faviconUrl: tab.faviconUrl ?? null,
          pinned: tab.pinned,
          position: tab.position,
          note: tab.note ?? null,
          addedAt: new Date(tab.addedAt),
        })),
      );
    }
  }

  if (deletes.length > 0) {
    await database
      .delete(workspace)
      .where(and(eq(workspace.userId, user.id), inArray(workspace.id, deletes)));
  }

  return json({ ok: true });
});
