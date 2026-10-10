import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseConfig {
  readonly url: string;
  readonly publishableKey: string;
}

/** A client that acts as the given user (RLS applies) and never persists a session: for one request on a server. */
export function createUserScopedClient(config: SupabaseConfig, accessToken: string): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** A client for a browser: keeps the session in storage and refreshes tokens. */
export function createBrowserClient(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.publishableKey);
}

export function supabaseConfigFromEnv(env: Readonly<Record<string, string | undefined>>): SupabaseConfig | undefined {
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  return url && publishableKey ? { url, publishableKey } : undefined;
}
