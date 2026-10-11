import {
  deserializeSchedule,
  deserializeTodo,
  LocalDate,
  serializeSchedule,
  serializeTodo,
  type AchievementReport,
  type AssistantContext,
  type ComposeReportRequest,
  type ExecutionPlan,
  type PlanExecutionRequest,
  type RefineTodosRequest,
  type ScheduleSnapshot,
  type TodoRefinement,
  type TodoSnapshot,
} from "@freenotes/core";

/**
 * JSON shapes exchanged between a freenotes client and a chief-of-staff server.
 * Only the request side needs codecs: todos carry LocalDate/LocalTime and schedules carry Dates.
 * Plans, refinements and reports are plain JSON already.
 */
export interface ContextWire {
  today: string;
  profile?: string;
}

export interface RefineWire {
  todos: TodoSnapshot[];
  rawBraindump: string;
  context: ContextWire;
}

export interface PlanWire {
  todo: TodoSnapshot;
  otherTodos: TodoSnapshot[];
  schedule?: ScheduleSnapshot;
  context: ContextWire;
}

export interface ReportWire {
  todos: TodoSnapshot[];
  results: ComposeReportRequest["results"];
  rawResults: string;
  schedule?: ScheduleSnapshot;
  plans: Record<string, ExecutionPlan>;
  context: ContextWire;
}

export type RefineResponse = { refinements: TodoRefinement[] };
export type PlanResponse = { plan: ExecutionPlan };
export type ReportResponse = { report: AchievementReport };

/** Single-segment paths on purpose: serverless catch-all routing (e.g. Vercel's api/[...route]) matches one segment. */
export const ROUTES = {
  refine: "/api/refine",
  plan: "/api/plan",
  report: "/api/report",
  status: "/api/status",
  providers: "/api/providers",
  me: "/api/me",
  settings: "/api/settings",
  verify: "/api/verify",
  ics: "/api/ics",
} as const;

export interface StatusResponse {
  available: boolean;
  name?: string;
  /** True when the server has accounts (sign-in, synced settings) enabled. */
  accounts?: boolean;
  /** "default" or the signed-in user's provider id. */
  provider?: string;
}

/** A user's assistant settings as the server returns them. The API key itself never comes back. */
export interface SettingsView {
  profile: string;
  provider: string;
  model?: string;
  baseUrl?: string;
  hasApiKey: boolean;
  apiKeyLast4?: string;
  updatedAt?: string;
}

/** Partial update. `apiKey: null` clears the stored key. */
export interface SettingsPatch {
  profile?: string;
  provider?: string;
  model?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
}

export interface ProviderView {
  id: string;
  label: string;
  defaultModel: string;
  suggestedModels: string[];
  needsApiKey: boolean;
  supportsBaseUrl: boolean;
  defaultBaseUrl?: string;
  note?: string;
}

function contextToWire(c: AssistantContext): ContextWire {
  return { today: c.today.toString(), ...(c.profile ? { profile: c.profile } : {}) };
}

function contextFromWire(c: ContextWire): AssistantContext {
  return { today: LocalDate.parse(c.today), ...(c.profile ? { profile: c.profile } : {}) };
}

export const refineCodec = {
  encode: (r: RefineTodosRequest): RefineWire => ({ todos: r.todos.map(serializeTodo), rawBraindump: r.rawBraindump, context: contextToWire(r.context) }),
  decode: (w: RefineWire): RefineTodosRequest => ({ todos: w.todos.map(deserializeTodo), rawBraindump: w.rawBraindump, context: contextFromWire(w.context) }),
};

export const planCodec = {
  encode: (r: PlanExecutionRequest): PlanWire => ({
    todo: serializeTodo(r.todo),
    otherTodos: r.otherTodos.map(serializeTodo),
    ...(r.schedule ? { schedule: serializeSchedule(r.schedule) } : {}),
    context: contextToWire(r.context),
  }),
  decode: (w: PlanWire): PlanExecutionRequest => ({
    todo: deserializeTodo(w.todo),
    otherTodos: w.otherTodos.map(deserializeTodo),
    ...(w.schedule ? { schedule: deserializeSchedule(w.schedule) } : {}),
    context: contextFromWire(w.context),
  }),
};

export const reportCodec = {
  encode: (r: ComposeReportRequest): ReportWire => ({
    todos: r.todos.map(serializeTodo),
    results: [...r.results],
    rawResults: r.rawResults,
    ...(r.schedule ? { schedule: serializeSchedule(r.schedule) } : {}),
    plans: { ...r.plans },
    context: contextToWire(r.context),
  }),
  decode: (w: ReportWire): ComposeReportRequest => ({
    todos: w.todos.map(deserializeTodo),
    results: w.results,
    rawResults: w.rawResults,
    ...(w.schedule ? { schedule: deserializeSchedule(w.schedule) } : {}),
    plans: w.plans,
    context: contextFromWire(w.context),
  }),
};
