import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { ChiefOfStaffError, DomainError, LocalDate, createTodo, type CalendarFeedFetcher, type ChiefOfStaff } from "@freenotes/core";
import { createChiefOfStaffHandlers, ROUTES, type SettingsPatch, type SettingsView } from "@freenotes/ai-http";
import { EMPTY_SETTINGS, type AssistantSettings, type AuthContext, type Authenticator, type ResolvedAssistant, type UserSettingsRepository } from "./ports.js";
import { createProviderChiefOfStaff, findProvider, providerViews } from "./providers.js";
import type { SecretBox } from "./secret-box.js";
import { FeedProxy } from "./feed-proxy.js";

export interface ApiOptions {
  /** The operator-configured assistant, used for anonymous requests and for users on "default". */
  readonly chiefOfStaff: ChiefOfStaff;
  readonly corsOrigin?: string;
  /** Accounts are enabled when all three are present. */
  readonly authenticator?: Authenticator;
  readonly settings?: UserSettingsRepository;
  readonly secretBox?: SecretBox;
  /** Fetches calendar feeds for the browser. Defaults to a public-https-only proxy. */
  readonly calendarFeeds?: CalendarFeedFetcher;
}

export type ApiEnv = { Variables: { auth: AuthContext | null } };
type Vars = ApiEnv["Variables"];

/** The chief-of-staff HTTP API as a Hono app. Mount it anywhere Hono runs. */
export function createApi(options: ApiOptions): Hono<{ Variables: Vars }> {
  const app = new Hono<{ Variables: Vars }>();
  const accounts = Boolean(options.authenticator && options.settings && options.secretBox);

  if (options.corsOrigin) app.use("/api/*", cors({ origin: options.corsOrigin }));

  // Resolve the bearer token once per request. Invalid tokens are rejected, missing ones are anonymous.
  app.use("/api/*", async (c, next) => {
    c.set("auth", null);
    const header = c.req.header("authorization");
    if (header?.toLowerCase().startsWith("bearer ")) {
      const token = header.slice(7).trim();
      if (!options.authenticator) return c.json({ error: "Accounts are not enabled on this server." }, 503);
      const user = await options.authenticator.userFromToken(token);
      if (!user) return c.json({ error: "Your session has expired. Sign in again." }, 401);
      c.set("auth", { user, token });
    }
    await next();
  });

  const requireAuth = (c: Context<{ Variables: Vars }>): AuthContext => {
    if (!accounts) throw new ApiHttpError(503, "Accounts are not enabled on this server.");
    const auth = c.get("auth");
    if (!auth) throw new ApiHttpError(401, "Sign in to use this.");
    return auth;
  };

  const loadSettings = async (auth: AuthContext): Promise<AssistantSettings> => (await options.settings!.get(auth)) ?? EMPTY_SETTINGS;

  /** The assistant for this request: the user's own provider and key when configured, else the operator default. */
  const resolve = async (c: Context<{ Variables: Vars }>): Promise<ResolvedAssistant> => {
    const auth = c.get("auth");
    if (!auth || !accounts) return { chiefOfStaff: options.chiefOfStaff, provider: "default" };
    const settings = await loadSettings(auth);
    const profile = settings.profile.trim() ? { profile: settings.profile.trim() } : {};
    if (settings.provider === "default") return { chiefOfStaff: options.chiefOfStaff, provider: "default", ...profile };
    const apiKey = settings.apiKeyCiphertext ? await options.secretBox!.open(settings.apiKeyCiphertext) : undefined;
    const chiefOfStaff = createProviderChiefOfStaff(settings.provider, {
      ...(apiKey ? { apiKey } : {}),
      ...(settings.model ? { model: settings.model } : {}),
      ...(settings.baseUrl ? { baseUrl: settings.baseUrl } : {}),
    });
    return { chiefOfStaff, provider: settings.provider, ...profile };
  };

  const handlersFor = (assistant: ResolvedAssistant) => createChiefOfStaffHandlers(assistant.chiefOfStaff);

  /** A signed-in user's stored profile applies unless the request carries its own. */
  const withProfile = <B extends { context?: { profile?: string } }>(body: B, assistant: ResolvedAssistant): B =>
    assistant.profile && body?.context && !body.context.profile ? { ...body, context: { ...body.context, profile: assistant.profile } } : body;

  app.get(ROUTES.status, async (c) => {
    const assistant = await resolve(c);
    return c.json({ ...handlersFor(assistant).status(), accounts, provider: assistant.provider });
  });
  app.post(ROUTES.refine, async (c) => {
    const assistant = await resolve(c);
    return c.json(await handlersFor(assistant).refine(withProfile(await c.req.json(), assistant)));
  });
  app.post(ROUTES.plan, async (c) => {
    const assistant = await resolve(c);
    return c.json(await handlersFor(assistant).plan(withProfile(await c.req.json(), assistant)));
  });
  app.post(ROUTES.report, async (c) => {
    const assistant = await resolve(c);
    return c.json(await handlersFor(assistant).report(withProfile(await c.req.json(), assistant)));
  });
  app.get("/api/health", (c) => c.json({ ok: true }));

  // Calendar feeds: the browser cannot fetch other origins, so the server does, with public-host guards.
  const feeds = options.calendarFeeds ?? new FeedProxy();
  app.get(ROUTES.ics, async (c) => {
    const url = c.req.query("url");
    if (!url) throw new DomainError("invalid-url", "Missing url.");
    const text = await feeds.fetchIcs(url);
    return c.text(text, 200, { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=60" });
  });

  app.get(ROUTES.providers, (c) => c.json({ providers: providerViews() }));

  app.get(ROUTES.me, (c) => {
    const auth = requireAuth(c);
    return c.json({ user: auth.user });
  });

  app.get(ROUTES.settings, async (c) => {
    const auth = requireAuth(c);
    return c.json(toView(await loadSettings(auth)));
  });

  app.put(ROUTES.settings, async (c) => {
    const auth = requireAuth(c);
    const patch = (await c.req.json()) as SettingsPatch;
    const current = await loadSettings(auth);
    const next = await applyPatch(current, patch, options.secretBox!);
    await options.settings!.save(auth, next);
    return c.json(toView((await options.settings!.get(auth)) ?? next));
  });

  /** Makes one tiny real call with the user's configured assistant so a bad key fails here, not mid-braindump. */
  app.post(ROUTES.verify, async (c) => {
    const auth = requireAuth(c);
    const assistant = await resolve(c);
    const probe = createTodo("T1", 0, { title: "Call the dentist" });
    await assistant.chiefOfStaff.refineTodos({ todos: [probe], rawBraindump: "- Call the dentist", context: { today: LocalDate.fromDate(new Date()) } });
    return c.json({ ok: true, name: assistant.chiefOfStaff.name, provider: assistant.provider, user: auth.user.id });
  });

  app.onError((error, c) => {
    if (error instanceof ApiHttpError) return c.json({ error: error.message }, error.status);
    if (error instanceof DomainError) return c.json({ error: error.message, code: error.code }, 400);
    if (error instanceof ChiefOfStaffError) return c.json({ error: error.message, code: error.code }, error.code === "api" ? 502 : error.code === "config" ? 400 : 422);
    if (error instanceof SyntaxError) return c.json({ error: "Malformed JSON body" }, 400);
    console.error(error);
    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}

class ApiHttpError extends Error {
  constructor(
    readonly status: 401 | 403 | 503,
    message: string,
  ) {
    super(message);
  }
}

function toView(s: AssistantSettings): SettingsView {
  return {
    profile: s.profile,
    provider: s.provider,
    ...(s.model ? { model: s.model } : {}),
    ...(s.baseUrl ? { baseUrl: s.baseUrl } : {}),
    hasApiKey: Boolean(s.apiKeyCiphertext),
    ...(s.apiKeyLast4 ? { apiKeyLast4: s.apiKeyLast4 } : {}),
    ...(s.updatedAt ? { updatedAt: s.updatedAt } : {}),
  };
}

export async function applyPatch(current: AssistantSettings, patch: SettingsPatch, box: SecretBox): Promise<AssistantSettings> {
  const provider = patch.provider ?? current.provider;
  if (provider !== "default" && !findProvider(provider)) throw new DomainError("unknown-provider", `Unknown provider "${provider}".`);
  let next: AssistantSettings = {
    ...current,
    provider,
    profile: patch.profile !== undefined ? patch.profile.slice(0, 2000) : current.profile,
  };
  if (patch.model !== undefined) next = withOptional(next, "model", patch.model?.trim() || undefined);
  if (patch.baseUrl !== undefined) {
    const baseUrl = patch.baseUrl?.trim() || undefined;
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) throw new DomainError("invalid-base-url", "Base URL must start with http:// or https://");
    next = withOptional(next, "baseUrl", baseUrl);
  }
  if (patch.apiKey !== undefined) {
    if (patch.apiKey === null || patch.apiKey.trim() === "") {
      next = withOptional(withOptional(next, "apiKeyCiphertext", undefined), "apiKeyLast4", undefined);
    } else {
      const key = patch.apiKey.trim();
      next = { ...next, apiKeyCiphertext: await box.seal(key), apiKeyLast4: key.slice(-4) };
    }
  }
  return next;
}

function withOptional<K extends "model" | "baseUrl" | "apiKeyCiphertext" | "apiKeyLast4">(s: AssistantSettings, key: K, value: string | undefined): AssistantSettings {
  const { [key]: _drop, ...rest } = s;
  return (value === undefined ? rest : { ...rest, [key]: value }) as unknown as AssistantSettings;
}
