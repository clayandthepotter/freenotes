import type { ChiefOfStaff } from "@freenotes/core";

export interface AuthenticatedUser {
  readonly id: string;
  readonly email?: string;
}

/** Turns a bearer token into a user, or null when it is invalid or expired. */
export interface Authenticator {
  userFromToken(token: string): Promise<AuthenticatedUser | null>;
}

/** What the server needs to act on a user's behalf (RLS-scoped data access). */
export interface AuthContext {
  readonly user: AuthenticatedUser;
  readonly token: string;
}

/** Per-user assistant configuration as stored. The API key is only ever stored encrypted. */
export interface AssistantSettings {
  readonly profile: string;
  /** "default" = the operator-configured assistant; otherwise a provider id from the registry. */
  readonly provider: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly apiKeyCiphertext?: string;
  readonly apiKeyLast4?: string;
  readonly updatedAt?: string;
}

export const EMPTY_SETTINGS: AssistantSettings = { profile: "", provider: "default" };

export interface UserSettingsRepository {
  get(ctx: AuthContext): Promise<AssistantSettings | null>;
  save(ctx: AuthContext, settings: AssistantSettings): Promise<void>;
}

export interface ResolvedAssistant {
  readonly chiefOfStaff: ChiefOfStaff;
  /** "default" when the operator's assistant is used, else the provider id. */
  readonly provider: string;
  readonly profile?: string;
}
