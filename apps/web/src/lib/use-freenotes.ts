import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Freenotes, type Workspace, type WorkspaceRepository } from "@freenotes/core";
import { HttpCalendarFeeds, HttpIssueSource } from "@freenotes/ai-http";
import { SupabaseWorkspaceRepository } from "@freenotes/supabase";
import { LocalStorageWorkspaceRepository } from "./local-storage-repository.js";
import { resolveAssistant, type AssistantMode, type ResolvedAssistant } from "./assistant.js";
import { supabase } from "./supabase.js";
import type { SessionState } from "./use-session.js";

export interface FreenotesState {
  readonly workspace: Workspace | undefined;
  readonly assistant: ResolvedAssistant | undefined;
  readonly busy: string | undefined;
  readonly error: string | undefined;
  readonly app: Freenotes | undefined;
  readonly localRepository: LocalStorageWorkspaceRepository;
  /** "cloud" when signed in and syncing to the account, else "local". */
  readonly storage: "cloud" | "local";
  run<T>(label: string, action: (app: Freenotes) => Promise<T>): Promise<T | undefined>;
  setMode(mode: AssistantMode): void;
  mode: AssistantMode;
  clearError(): void;
  reload(): Promise<void>;
  /** Re-resolve the assistant, e.g. after settings changed on the server. */
  refreshAssistant(): void;
  profile: string;
  setProfile(p: string): void;
  /** Linear: a key is known either locally (not signed in) or on the account. */
  readonly linearConnected: boolean;
  readonly localLinearKey: string | undefined;
  setLocalLinearKey(key: string | undefined): void;
  refreshIntegrations(): void;
}

const MODE_KEY = "freenotes.assistant.mode";
const PROFILE_KEY = "freenotes.profile";
const LINEAR_KEY = "freenotes.linear.key";

export function useFreenotes(session: SessionState): FreenotesState {
  const localRepository = useMemo(() => new LocalStorageWorkspaceRepository(window.localStorage), []);
  const userId = session.session?.user.id;
  const storage: "cloud" | "local" = userId && supabase ? "cloud" : "local";

  const repository = useMemo<WorkspaceRepository>(() => (userId && supabase ? new SupabaseWorkspaceRepository(supabase, userId) : localRepository), [userId, localRepository]);

  const [workspace, setWorkspace] = useState<Workspace>();
  const [assistant, setAssistant] = useState<ResolvedAssistant>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [assistantNonce, setAssistantNonce] = useState(0);
  const [mode, setModeState] = useState<AssistantMode>(() => (window.localStorage.getItem(MODE_KEY) as AssistantMode | null) ?? "auto");
  const [profile, setProfileState] = useState<string>(() => window.localStorage.getItem(PROFILE_KEY) ?? "");
  const [localLinearKey, setLocalLinearKeyState] = useState<string | undefined>(() => window.localStorage.getItem(LINEAR_KEY) ?? undefined);
  const localLinearRef = useRef(localLinearKey);
  const [accountLinear, setAccountLinear] = useState(false);
  const [integrationsNonce, setIntegrationsNonce] = useState(0);
  const appRef = useRef<Freenotes | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      setWorkspace(await repository.load());
    } catch (e) {
      setError((e as Error).message);
    }
  }, [repository]);

  // Load the workspace whenever the storage changes; on first sign-in offer to carry the local workspace over.
  useEffect(() => {
    if (session.loading) return;
    let cancelled = false;
    void (async () => {
      if (repository instanceof SupabaseWorkspaceRepository) {
        try {
          const local = await localRepository.load();
          const hasLocalData = local.todos.length > 0 || local.compositions.length > 0;
          if (hasLocalData && (await repository.isEmpty()) && window.confirm("Your account has no workspace yet. Copy the workspace from this browser into your account?")) {
            await repository.save(local);
          }
        } catch (e) {
          if (!cancelled) setError((e as Error).message);
        }
      }
      if (!cancelled) await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [repository, localRepository, reload, session.loading]);

  useEffect(() => {
    if (session.loading) return;
    let cancelled = false;
    resolveAssistant(mode, session.getToken)
      .then((a) => {
        if (!cancelled) setAssistant(a);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, session.loading, session.getToken, userId, assistantNonce]);

  const app = useMemo(() => {
    if (!assistant) return undefined;
    // Signed-in users keep their profile on the server; it is applied there.
    const localProfile = storage === "local" && profile.trim() ? { profile: profile.trim() } : {};
    const instance = new Freenotes({
      repository,
      chiefOfStaff: assistant.chiefOfStaff,
      calendarFeeds: new HttpCalendarFeeds({ getToken: session.getToken }),
      issues: new HttpIssueSource({ getToken: session.getToken, localLinearKey: () => (storage === "local" ? localLinearRef.current : undefined) }),
      ...localProfile,
    });
    appRef.current = instance;
    return instance;
  }, [assistant, repository, profile, storage, session.getToken]);

  // Keep connected calendars fresh: pull again when the newest sync is older than fifteen minutes.
  const syncingRef = useRef(false);
  useEffect(() => {
    if (!app || !workspace || workspace.calendar.calendars.length === 0 || syncingRef.current) return;
    const newest = Math.max(0, ...workspace.calendar.calendars.map((c) => c.lastSyncedAt?.getTime() ?? 0));
    if (Date.now() - newest < 15 * 60_000) return;
    syncingRef.current = true;
    void app
      .syncCalendars()
      .then(() => reload())
      .catch((e: Error) => console.warn("calendar sync failed", e.message))
      .finally(() => {
        syncingRef.current = false;
      });
  }, [app, workspace, reload]);

  const run = useCallback(
    async <T,>(label: string, action: (app: Freenotes) => Promise<T>): Promise<T | undefined> => {
      const current = appRef.current;
      if (!current) return undefined;
      setBusy(label);
      setError(undefined);
      try {
        const out = await action(current);
        await reload();
        return out;
      } catch (e) {
        setError((e as Error).message);
        return undefined;
      } finally {
        setBusy(undefined);
      }
    },
    [reload],
  );

  // Whether the account holds a Linear key (signed in) is read from the server's settings view.
  useEffect(() => {
    if (storage !== "cloud" || !assistant?.api) {
      setAccountLinear(false);
      return;
    }
    let cancelled = false;
    assistant.api
      .getSettings()
      .then((s) => {
        if (!cancelled) setAccountLinear(s.hasLinearKey);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [storage, assistant, integrationsNonce]);

  const setLocalLinearKey = useCallback((key: string | undefined) => {
    if (key) window.localStorage.setItem(LINEAR_KEY, key);
    else window.localStorage.removeItem(LINEAR_KEY);
    localLinearRef.current = key;
    setLocalLinearKeyState(key);
  }, []);

  const setMode = useCallback((m: AssistantMode) => {
    window.localStorage.setItem(MODE_KEY, m);
    setModeState(m);
  }, []);

  const setProfile = useCallback((p: string) => {
    window.localStorage.setItem(PROFILE_KEY, p);
    setProfileState(p);
  }, []);

  return {
    workspace,
    assistant,
    busy,
    error,
    app,
    localRepository,
    storage,
    run,
    setMode,
    mode,
    clearError: () => setError(undefined),
    reload,
    refreshAssistant: () => setAssistantNonce((n) => n + 1),
    profile,
    setProfile,
    linearConnected: storage === "local" ? Boolean(localLinearKey) : accountLinear,
    localLinearKey,
    setLocalLinearKey,
    refreshIntegrations: () => setIntegrationsNonce((n) => n + 1),
  };
}
