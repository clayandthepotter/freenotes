import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssistantSettings, AuthContext, UserSettingsRepository } from "@freenotes/api";
import { createUserScopedClient, type SupabaseConfig } from "./client.js";

interface Row {
  user_id: string;
  profile: string;
  provider: string;
  model: string | null;
  base_url: string | null;
  api_key_ciphertext: string | null;
  api_key_last4: string | null;
  updated_at: string;
}

/** Reads and writes `public.user_settings` as the signed-in user, so row-level security does the authorisation. */
export class SupabaseUserSettingsRepository implements UserSettingsRepository {
  constructor(
    private readonly config: SupabaseConfig,
    private readonly clientFor: (ctx: AuthContext) => SupabaseClient = (ctx) => createUserScopedClient(config, ctx.token),
  ) {}

  async get(ctx: AuthContext): Promise<AssistantSettings | null> {
    const { data, error } = await this.clientFor(ctx)
      .from("user_settings")
      .select("user_id, profile, provider, model, base_url, api_key_ciphertext, api_key_last4, updated_at")
      .eq("user_id", ctx.user.id)
      .maybeSingle<Row>();
    if (error) throw new Error(`Could not load settings: ${error.message}`);
    return data ? fromRow(data) : null;
  }

  async save(ctx: AuthContext, settings: AssistantSettings): Promise<void> {
    const { error } = await this.clientFor(ctx).from("user_settings").upsert(toRow(ctx.user.id, settings), { onConflict: "user_id" });
    if (error) throw new Error(`Could not save settings: ${error.message}`);
  }
}

export function fromRow(row: Row): AssistantSettings {
  return {
    profile: row.profile ?? "",
    provider: row.provider ?? "default",
    ...(row.model ? { model: row.model } : {}),
    ...(row.base_url ? { baseUrl: row.base_url } : {}),
    ...(row.api_key_ciphertext ? { apiKeyCiphertext: row.api_key_ciphertext } : {}),
    ...(row.api_key_last4 ? { apiKeyLast4: row.api_key_last4 } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

export function toRow(userId: string, s: AssistantSettings): Omit<Row, "updated_at"> {
  return {
    user_id: userId,
    profile: s.profile,
    provider: s.provider,
    model: s.model ?? null,
    base_url: s.baseUrl ?? null,
    api_key_ciphertext: s.apiKeyCiphertext ?? null,
    api_key_last4: s.apiKeyLast4 ?? null,
  };
}
