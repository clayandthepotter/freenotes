import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

export interface SessionState {
  readonly session: Session | null;
  /** True until the first session check completes, so the UI does not flash the signed-out state. */
  readonly loading: boolean;
  readonly available: boolean;
  sendMagicLink(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  signOut(): Promise<void>;
  /** The current access token, refreshed by supabase-js as needed. */
  getToken(): Promise<string | null>;
}

export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    if (!supabase) throw new Error("Accounts are not available in this deployment.");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    if (error) throw new Error(error.message);
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    if (!supabase) throw new Error("Accounts are not available in this deployment.");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) throw new Error(error.message);
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
  }, []);

  const getToken = useCallback(async () => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  return { session, loading, available: Boolean(supabase), sendMagicLink, verifyCode, signOut, getToken };
}
