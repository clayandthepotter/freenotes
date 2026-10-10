import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Freenotes, type Workspace } from "@freenotes/core";
import { LocalStorageWorkspaceRepository } from "./local-storage-repository.js";
import { resolveAssistant, type AssistantMode, type ResolvedAssistant } from "./assistant.js";

export interface FreenotesState {
  readonly workspace: Workspace | undefined;
  readonly assistant: ResolvedAssistant | undefined;
  readonly busy: string | undefined;
  readonly error: string | undefined;
  readonly app: Freenotes | undefined;
  readonly repository: LocalStorageWorkspaceRepository;
  run<T>(label: string, action: (app: Freenotes) => Promise<T>): Promise<T | undefined>;
  setMode(mode: AssistantMode): void;
  mode: AssistantMode;
  clearError(): void;
  reload(): Promise<void>;
}

const MODE_KEY = "freenotes.assistant.mode";
const PROFILE_KEY = "freenotes.profile";

export function useFreenotes(): FreenotesState & { profile: string; setProfile(p: string): void } {
  const repository = useMemo(() => new LocalStorageWorkspaceRepository(window.localStorage), []);
  const [workspace, setWorkspace] = useState<Workspace>();
  const [assistant, setAssistant] = useState<ResolvedAssistant>();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [mode, setModeState] = useState<AssistantMode>(() => (window.localStorage.getItem(MODE_KEY) as AssistantMode | null) ?? "auto");
  const [profile, setProfileState] = useState<string>(() => window.localStorage.getItem(PROFILE_KEY) ?? "");
  const appRef = useRef<Freenotes | undefined>(undefined);

  const reload = useCallback(async () => setWorkspace(await repository.load()), [repository]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    resolveAssistant(mode)
      .then((a) => {
        if (!cancelled) setAssistant(a);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const app = useMemo(() => {
    if (!assistant) return undefined;
    const instance = new Freenotes({ repository, chiefOfStaff: assistant.chiefOfStaff, ...(profile.trim() ? { profile: profile.trim() } : {}) });
    appRef.current = instance;
    return instance;
  }, [assistant, repository, profile]);

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

  const setMode = useCallback((m: AssistantMode) => {
    window.localStorage.setItem(MODE_KEY, m);
    setModeState(m);
  }, []);

  const setProfile = useCallback((p: string) => {
    window.localStorage.setItem(PROFILE_KEY, p);
    setProfileState(p);
  }, []);

  return { workspace, assistant, busy, error, app, repository, run, setMode, mode, clearError: () => setError(undefined), reload, profile, setProfile };
}
