import { useCallback, useEffect, useMemo, useState } from "react";
import type { UiState } from "../shared/messages";
import { sendBg } from "../shared/messages";

/** Dashboard state: one snapshot from the background + live refresh on change. */
export function useUiState() {
  const [state, setState] = useState<UiState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState(await sendBg({ type: "get-state" }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach Thicket.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const listener = (message: { type?: string }) => {
      if (message?.type === "thicket:state-changed") void refresh();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [refresh]);

  return { state, error, refresh, setState };
}

export function useHashRoute(): [string, (next: string) => void] {
  const parse = () => (window.location.hash.replace(/^#\/?/, "").split("?")[0] || "now");
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onHash = () => setRoute(parse());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const navigate = useCallback((next: string) => {
    window.location.hash = `/${next}`;
  }, []);
  return [route, navigate];
}

export function useTheme(theme: "system" | "light" | "dark" | undefined) {
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme !== "light" && media.matches);
      root.classList.toggle("dark", dark);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

export function formatRelative(at: number | undefined): string {
  if (!at) return "";
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function useFavicon() {
  return useMemo(() => {
    return (url: string, size = 32) => {
      const u = new URL(chrome.runtime.getURL("/_favicon/"));
      u.searchParams.set("pageUrl", url);
      u.searchParams.set("size", String(size));
      return u.toString();
    };
  }, []);
}
