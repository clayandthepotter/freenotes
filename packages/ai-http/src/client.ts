import type {
  AchievementReport,
  CalendarFeedFetcher,
  ChiefOfStaff,
  ExternalIssue,
  IssueSource,
  ComposeReportRequest,
  ExecutionPlan,
  PlanExecutionRequest,
  RefineTodosRequest,
  TodoRefinement,
} from "@freenotes/core";
import {
  issueFromWire,
  planCodec,
  refineCodec,
  reportCodec,
  ROUTES,
  type IssuesResponse,
  type PlanResponse,
  type ProviderView,
  type RefineResponse,
  type ReportResponse,
  type SettingsPatch,
  type SettingsView,
  type StatusResponse,
} from "./protocol.js";

export interface HttpChiefOfStaffOptions {
  /** Base URL of the freenotes server, e.g. "" (same origin) or "http://localhost:8787". */
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly name?: string;
  /** Supplies the signed-in user's bearer token, if any. Called per request so refreshed tokens are picked up. */
  readonly getToken?: () => Promise<string | null | undefined>;
}

export class HttpChiefOfStaffError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpChiefOfStaffError";
  }
}

/** A chief of staff that lives behind an HTTP API (so the API key stays on the server). */
export class HttpChiefOfStaff implements ChiefOfStaff {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getToken: () => Promise<string | null | undefined>;

  constructor(options: HttpChiefOfStaffOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.name = options.name ?? "claude (via server)";
    this.getToken = options.getToken ?? (async () => null);
  }

  async refineTodos(request: RefineTodosRequest): Promise<readonly TodoRefinement[]> {
    const res = await this.post<RefineResponse>(ROUTES.refine, refineCodec.encode(request));
    return res.refinements;
  }

  async planExecution(request: PlanExecutionRequest): Promise<ExecutionPlan> {
    const res = await this.post<PlanResponse>(ROUTES.plan, planCodec.encode(request));
    return res.plan;
  }

  async composeAchievementReport(request: ComposeReportRequest): Promise<AchievementReport> {
    const res = await this.post<ReportResponse>(ROUTES.report, reportCodec.encode(request));
    return res.report;
  }

  /** Whether a server with a configured model is reachable. Includes the resolved provider for the signed-in user. */
  async status(): Promise<StatusResponse> {
    try {
      const res = await this.fetchImpl(this.baseUrl + ROUTES.status, { headers: await this.headers() });
      if (!res.ok) return { available: false };
      return (await res.json()) as StatusResponse;
    } catch {
      return { available: false };
    }
  }

  // --- account endpoints -----------------------------------------------------------------------

  async providers(): Promise<ProviderView[]> {
    return ((await this.request<{ providers: ProviderView[] }>("GET", ROUTES.providers)).providers) ?? [];
  }

  getSettings(): Promise<SettingsView> {
    return this.request<SettingsView>("GET", ROUTES.settings);
  }

  saveSettings(patch: SettingsPatch): Promise<SettingsView> {
    return this.request<SettingsView>("PUT", ROUTES.settings, patch);
  }

  /** Makes one small real call with the user's configured assistant; throws HttpChiefOfStaffError on a bad key/model. */
  verifyAssistant(): Promise<{ ok: boolean; name: string; provider: string }> {
    return this.request("POST", ROUTES.verify, {});
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async headers(): Promise<Record<string, string>> {
    const token = await this.getToken();
    return { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) };
  }

  private async request<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + path, {
      method,
      headers: await this.headers(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      let message = `${res.status} ${res.statusText}`;
      try {
        const err = (await res.json()) as { error?: string };
        if (err.error) message = err.error;
      } catch {
        /* keep status text */
      }
      throw new HttpChiefOfStaffError(res.status, message);
    }
    return (await res.json()) as T;
  }
}

/** Pulls calendar feeds through the server's /api/ics proxy (browsers cannot fetch other origins). */
export class HttpCalendarFeeds implements CalendarFeedFetcher {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getToken: () => Promise<string | null | undefined>;

  constructor(options: HttpChiefOfStaffOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.getToken = options.getToken ?? (async () => null);
  }

  async fetchIcs(url: string): Promise<string> {
    const token = await this.getToken();
    const res = await this.fetchImpl(`${this.baseUrl}${ROUTES.ics}?url=${encodeURIComponent(url)}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (!res.ok) {
      let message = `Calendar proxy answered ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        /* not JSON */
      }
      throw new HttpChiefOfStaffError(res.status, message);
    }
    return res.text();
  }
}

/** Issues assigned to me, read through the server. A local (not signed-in) key rides along in a header. */
export class HttpIssueSource implements IssueSource {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getToken: () => Promise<string | null | undefined>;

  constructor(private readonly options: HttpChiefOfStaffOptions & { localLinearKey?: () => string | undefined } = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.getToken = options.getToken ?? (async () => null);
    this.name = "linear";
  }

  async assignedToMe(): Promise<readonly ExternalIssue[]> {
    const token = await this.getToken();
    const local = this.options.localLinearKey?.();
    const res = await this.fetchImpl(`${this.baseUrl}${ROUTES.issues}`, { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(local ? { "x-linear-api-key": local } : {}) } });
    if (!res.ok) {
      let message = `Issue tracker answered ${res.status}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) message = body.error;
      } catch {
        /* not JSON */
      }
      throw new HttpChiefOfStaffError(res.status, message);
    }
    const body = (await res.json()) as IssuesResponse;
    return body.issues.map(issueFromWire);
  }
}
