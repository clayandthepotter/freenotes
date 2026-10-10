import type {
  AchievementReport,
  ChiefOfStaff,
  ComposeReportRequest,
  ExecutionPlan,
  PlanExecutionRequest,
  RefineTodosRequest,
  TodoRefinement,
} from "@freenotes/core";
import { planCodec, refineCodec, reportCodec, ROUTES, type PlanResponse, type RefineResponse, type ReportResponse } from "./protocol.js";

export interface HttpChiefOfStaffOptions {
  /** Base URL of the freenotes server, e.g. "" (same origin) or "http://localhost:8787". */
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly name?: string;
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

  constructor(options: HttpChiefOfStaffOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.name = options.name ?? "claude (via server)";
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

  /** Whether a server with a configured model is reachable. */
  async status(): Promise<{ available: boolean; name?: string }> {
    try {
      const res = await this.fetchImpl(this.baseUrl + ROUTES.status);
      if (!res.ok) return { available: false };
      return (await res.json()) as { available: boolean; name?: string };
    } catch {
      return { available: false };
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
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
