import { describe, expect, it } from "vitest";
import { HeuristicChiefOfStaff } from "@freenotes/core";
import { ROUTES } from "@freenotes/ai-http";
import { createApi } from "./api.js";
import { SecretBox } from "./secret-box.js";
import type { AssistantSettings, AuthContext, Authenticator, UserSettingsRepository } from "./ports.js";

const users: Record<string, { id: string; email: string }> = { "token-ada": { id: "u-ada", email: "ada@example.com" } };
const authenticator: Authenticator = { userFromToken: async (t) => users[t] ?? null };

class MemorySettings implements UserSettingsRepository {
  rows = new Map<string, AssistantSettings>();
  async get(ctx: AuthContext) {
    return this.rows.get(ctx.user.id) ?? null;
  }
  async save(ctx: AuthContext, s: AssistantSettings) {
    this.rows.set(ctx.user.id, { ...s, updatedAt: "2026-10-12T00:00:00Z" });
  }
}

async function build() {
  const settings = new MemorySettings();
  const secretBox = await SecretBox.fromSecret(Buffer.alloc(32, 3).toString("base64"));
  const app = createApi({ chiefOfStaff: new HeuristicChiefOfStaff(), authenticator, settings, secretBox });
  const call = (path: string, init: RequestInit & { token?: string } = {}) =>
    app.request(path, {
      ...init,
      headers: { "content-type": "application/json", ...(init.token ? { authorization: `Bearer ${init.token}` } : {}) },
    });
  return { app, settings, secretBox, call };
}

describe("accounts and settings", () => {
  it("reports accounts in status, anonymous requests still work", async () => {
    const { call } = await build();
    expect(await (await call(ROUTES.status)).json()).toEqual({ available: true, name: "heuristic", accounts: true, provider: "default" });
    expect((await call(ROUTES.settings)).status).toBe(401);
    expect((await call(ROUTES.settings, { token: "nope" })).status).toBe(401);
  });

  it("lists providers without secrets", async () => {
    const { call } = await build();
    const { providers } = (await (await call(ROUTES.providers)).json()) as { providers: Array<Record<string, unknown>> };
    expect(providers.map((p) => p.id)).toEqual(["anthropic", "openai", "openai-compatible"]);
    expect(providers.every((p) => !("create" in p))).toBe(true);
  });

  it("stores settings with the API key encrypted and only ever returns the last four characters", async () => {
    const { call, settings, secretBox } = await build();
    const put = await call(ROUTES.settings, { method: "PUT", token: "token-ada", body: JSON.stringify({ provider: "anthropic", model: "claude-sonnet-5-5", apiKey: "sk-ant-abcdef1234", profile: "Head of product" }) });
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({ profile: "Head of product", provider: "anthropic", model: "claude-sonnet-5-5", hasApiKey: true, apiKeyLast4: "1234", updatedAt: "2026-10-12T00:00:00Z" });

    const stored = settings.rows.get("u-ada")!;
    expect(stored.apiKeyCiphertext).not.toContain("abcdef");
    expect(await secretBox.open(stored.apiKeyCiphertext!)).toBe("sk-ant-abcdef1234");

    const got = (await (await call(ROUTES.settings, { token: "token-ada" })).json()) as Record<string, unknown>;
    expect(got.hasApiKey).toBe(true);
    expect(JSON.stringify(got)).not.toContain("abcdef");

    // Clearing the key and switching back to the operator default.
    const cleared = await call(ROUTES.settings, { method: "PUT", token: "token-ada", body: JSON.stringify({ apiKey: null, provider: "default" }) });
    expect(await cleared.json()).toMatchObject({ provider: "default", hasApiKey: false, model: "claude-sonnet-5-5" });
  });

  it("validates provider ids and base URLs", async () => {
    const { call } = await build();
    expect((await call(ROUTES.settings, { method: "PUT", token: "token-ada", body: JSON.stringify({ provider: "skynet" }) })).status).toBe(400);
    expect((await call(ROUTES.settings, { method: "PUT", token: "token-ada", body: JSON.stringify({ provider: "openai-compatible", baseUrl: "ftp://x" }) })).status).toBe(400);
  });

  it("uses the user's own provider for assistant calls and the default when none is configured", async () => {
    const { call } = await build();
    // Default: heuristic.
    expect(await (await call(ROUTES.status, { token: "token-ada" })).json()).toMatchObject({ name: "heuristic", provider: "default" });
    // Anthropic without a key → config error surfaces clearly.
    await call(ROUTES.settings, { method: "PUT", token: "token-ada", body: JSON.stringify({ provider: "anthropic" }) });
    const res = await call(ROUTES.status, { token: "token-ada" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/needs an API key/);
    // With a key the resolved assistant is Claude (no network call is made for status).
    await call(ROUTES.settings, { method: "PUT", token: "token-ada", body: JSON.stringify({ apiKey: "sk-ant-test", model: "claude-haiku-5-5" }) });
    expect(await (await call(ROUTES.status, { token: "token-ada" })).json()).toMatchObject({ name: "claude (claude-haiku-5-5)", provider: "anthropic" });
  });

  it("verify runs a real probe through the resolved assistant", async () => {
    const { call } = await build();
    const res = await call(ROUTES.verify, { method: "POST", token: "token-ada" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, name: "heuristic", provider: "default", user: "u-ada" });
  });

  it("returns 503 for account routes when accounts are not enabled", async () => {
    const app = createApi({ chiefOfStaff: new HeuristicChiefOfStaff() });
    expect((await app.request(ROUTES.me, { headers: { authorization: "Bearer x" } })).status).toBe(503);
    expect(await (await app.request(ROUTES.status)).json()).toMatchObject({ accounts: false });
  });
});
