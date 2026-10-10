import { useCallback, useEffect, useState } from "react";

export type Tab = "today" | "capture" | "plan" | "review" | "notes" | "settings" | "setup";
export interface Route {
  readonly tab: Tab;
  readonly id?: string;
}

const TABS: Tab[] = ["today", "capture", "plan", "review", "notes", "settings", "setup"];

function parse(hash: string): Route {
  const [tab = "today", id] = hash.replace(/^#\/?/, "").split("/");
  return TABS.includes(tab as Tab) ? { tab: tab as Tab, ...(id ? { id: decodeURIComponent(id) } : {}) } : { tab: "today" };
}

export function toHash(route: Route): string {
  return `#/${route.tab}${route.id ? `/${encodeURIComponent(route.id)}` : ""}`;
}

/** Hash-based routing so the phone's back button and deep links work without a server rewrite. */
export function useRoute(): { route: Route; navigate: (r: Route, replace?: boolean) => void; back: (fallback: Route) => void } {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((r: Route, replace = false) => {
    const hash = toHash(r);
    if (replace) window.history.replaceState(null, "", hash);
    else window.location.hash = hash;
    setRoute(r);
  }, []);
  const back = useCallback(
    (fallback: Route) => {
      if (window.history.length > 1) window.history.back();
      else navigate(fallback, true);
    },
    [navigate],
  );
  return { route, navigate, back };
}
