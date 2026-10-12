import { useCallback, useEffect, useState } from "react";

declare const __FREENOTES_BUILD__: string;
export const BUILD = typeof __FREENOTES_BUILD__ === "string" ? __FREENOTES_BUILD__ : "dev";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface PwaState {
  /** Running from the home screen / as an installed app. */
  readonly standalone: boolean;
  /** The browser offered an install prompt we can trigger (Chrome, Edge, Android). */
  readonly canInstall: boolean;
  /** iOS Safari: no prompt API; the user adds it through the share sheet. */
  readonly iosHint: boolean;
  readonly offlineReady: boolean;
  readonly updateReady: boolean;
  install(): Promise<boolean>;
  applyUpdate(): void;
}

export function usePwa(): PwaState {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(() => isStandalone());
  const [offlineReady, setOfflineReady] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const mq = window.matchMedia("(display-mode: standalone)");
    const onMode = () => setStandalone(isStandalone());
    mq.addEventListener("change", onMode);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mq.removeEventListener("change", onMode);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        if (cancelled) return;
        if (reg.active && !reg.installing && !reg.waiting) setOfflineReady(true);
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state !== "installed") return;
            if (navigator.serviceWorker.controller) setWaiting(sw);
            else setOfflineReady(true);
          });
        });
      })
      .catch((e: Error) => console.warn("service worker registration failed", e.message));
    let refreshing = false;
    const onChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return false;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    return choice.outcome === "accepted";
  }, [prompt]);

  const applyUpdate = useCallback(() => {
    waiting?.postMessage("SKIP_WAITING");
  }, [waiting]);

  return {
    standalone,
    canInstall: Boolean(prompt) && !standalone,
    iosHint: isIos() && !standalone && !prompt,
    offlineReady,
    updateReady: Boolean(waiting),
    install,
    applyUpdate,
  };
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
