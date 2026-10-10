import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedUser, Authenticator } from "@freenotes/api";
import type { SupabaseConfig } from "./client.js";

/** Verifies a Supabase access token by asking the Auth server for the user it belongs to. */
export class SupabaseAuthenticator implements Authenticator {
  private readonly client: SupabaseClient;

  constructor(config: SupabaseConfig, client?: SupabaseClient) {
    this.client =
      client ??
      createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
  }

  async userFromToken(token: string): Promise<AuthenticatedUser | null> {
    if (!token) return null;
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) return null;
    return { id: data.user.id, ...(data.user.email ? { email: data.user.email } : {}) };
  }
}
