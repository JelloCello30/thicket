import type {
  AiCommandRequest,
  AiCompareRequest,
  AiCompareResponse,
  AiOrganizeRequest,
  AiOrganizeResponse,
  AiSummarizeRequest,
  AiSummarizeResponse,
  SearchResultItem,
  SyncPagesRequest,
  SyncWorkspacesRequest,
} from "@thicket/types";
import { APP_URL, EXT_VERSION } from "./env";
import { readState } from "./storage";

/** Server API client. Bearer device-token auth; no cookies, no host permissions. */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function baseUrl(): Promise<string> {
  const { appUrlOverride } = await readState("appUrlOverride");
  return appUrlOverride || APP_URL;
}

async function request<T>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> {
  const url = `${await baseUrl()}${path}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-thicket-version": EXT_VERSION,
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.auth !== false) {
    const { auth } = await readState("auth");
    if (!auth) throw new ApiError(401, "auth-required", "Sign in to use this feature.");
    headers.authorization = `Bearer ${auth.token}`;
  }
  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch {
    throw new ApiError(0, "network", "Couldn't reach Thicket. Check your connection.");
  }
  if (!response.ok) {
    let code = "internal";
    let message = `Request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}

export const api = {
  linkDevice: (code: string, device: { name: string; browser: string }) =>
    request<{ token: string; deviceId: string; user: { email: string; name: string; plan: "free" | "pro" } }>(
      "/api/devices/link/complete",
      { method: "POST", body: JSON.stringify({ code, device }), auth: false },
    ),
  me: () =>
    request<{
      user: { email: string; name: string; plan: "free" | "pro" };
      entitlements: { maxWorkspaces: number | null; semanticSearch: boolean; summaries: boolean; compare: boolean };
    }>("/api/me"),
  revokeSelf: () => request<{ ok: true }>("/api/devices/self", { method: "DELETE" }),
  syncWorkspaces: (body: SyncWorkspacesRequest) =>
    request<{ workspaces: unknown[] }>("/api/sync/workspaces", { method: "POST", body: JSON.stringify(body) }),
  pullWorkspaces: () =>
    request<{ workspaces: import("@thicket/types").WorkspaceData[] }>("/api/sync/workspaces"),
  syncPages: (body: SyncPagesRequest) =>
    request<{ recorded: number }>("/api/sync/pages", { method: "POST", body: JSON.stringify(body) }),
  deletePages: (body: { urls?: string[]; all?: boolean }) =>
    request<{ deleted: number }>("/api/sync/pages", { method: "DELETE", body: JSON.stringify(body) }),
  search: (query: string) =>
    request<{ results: SearchResultItem[]; semantic: boolean }>(
      `/api/search?q=${encodeURIComponent(query)}`,
    ),
  aiOrganize: (body: AiOrganizeRequest) =>
    request<AiOrganizeResponse>("/api/ai/organize", { method: "POST", body: JSON.stringify(body) }),
  aiSummarize: (body: AiSummarizeRequest) =>
    request<AiSummarizeResponse>("/api/ai/summarize", { method: "POST", body: JSON.stringify(body) }),
  aiCompare: (body: AiCompareRequest) =>
    request<AiCompareResponse>("/api/ai/compare", { method: "POST", body: JSON.stringify(body) }),
  aiCommand: (body: AiCommandRequest) =>
    request<{ intent: string; groupId?: string; workspaceId?: string; query?: string; answer?: string }>(
      "/api/ai/command",
      { method: "POST", body: JSON.stringify(body) },
    ),
  trackEvents: (events: { name: string; props: Record<string, string | number | boolean>; at: number }[]) =>
    request<{ ok: true }>("/api/events", { method: "POST", body: JSON.stringify({ events }) }),
  reportError: (body: { message: string; stack?: string; context?: string; version?: string; at: number }) =>
    request<{ ok: true }>("/api/errors", { method: "POST", body: JSON.stringify(body), auth: false }),
};
