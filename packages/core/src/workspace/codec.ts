import { LocalDate, LocalTime } from "../shared/local-date.js";
import { TimeRange } from "../shared/time-range.js";
import { WorkingHours } from "../planning/working-hours.js";
import type { Todo } from "../planning/todo.js";
import type { Schedule, ScheduleWarning } from "../planning/schedule.js";
import type { Workspace } from "./workspace.js";
import type { Composition } from "../composition/composition.js";
import type { AchievementReport } from "../review/achievement-report.js";
import { DomainError } from "../shared/result.js";

/** JSON-safe shape of a workspace. Dates are ISO strings. */
export interface WorkspaceSnapshot {
  version: 1;
  compositions: Array<{ id: string; kind: string; title: string; body: string; createdAt: string; todoIds: string[] }>;
  todos: Array<{
    id: string;
    title: string;
    order: number;
    priority: string;
    estimatedMinutes: number;
    estimateSource: string;
    deadline?: { date: string; time?: string };
    notes?: string;
  }>;
  schedule?: {
    generatedAt: string;
    horizon: { start: string; end: string };
    blocks: Array<{ todoId: string; range: { start: string; end: string }; part: { index: number; of: number } }>;
    unscheduled: Array<{ todoId: string; remainingMinutes: number; reason: string }>;
    warnings: Array<Record<string, unknown>>;
  };
  plans: Record<string, unknown>;
  /** Optional for snapshots written before step progress existed. */
  progress?: Array<{ todoId: string; step: number; done: boolean; note: string; updatedAt: string }>;
  results: unknown[];
  report?: unknown;
  reflections: Array<{ todoId: string; question: string; answer: string; answeredAt: string }>;
  settings: { workingHours: Record<string, { start: string; end: string }>; policy: Record<string, number> };
}

export type TodoSnapshot = WorkspaceSnapshot["todos"][number];
export type ScheduleSnapshot = NonNullable<WorkspaceSnapshot["schedule"]>;

export function serializeTodo(t: Todo): TodoSnapshot {
  return {
    id: t.id,
    title: t.title,
    order: t.order,
    priority: t.priority,
    estimatedMinutes: t.estimatedMinutes,
    estimateSource: t.estimateSource,
    ...(t.deadline ? { deadline: { date: t.deadline.date.toString(), ...(t.deadline.time ? { time: t.deadline.time.toString() } : {}) } } : {}),
    ...(t.notes ? { notes: t.notes } : {}),
  };
}

export function deserializeTodo(t: TodoSnapshot): Todo {
  return {
    id: t.id,
    title: t.title,
    order: t.order,
    priority: t.priority as Todo["priority"],
    estimatedMinutes: t.estimatedMinutes,
    estimateSource: t.estimateSource as Todo["estimateSource"],
    ...(t.deadline ? { deadline: { date: LocalDate.parse(t.deadline.date), ...(t.deadline.time ? { time: LocalTime.parse(t.deadline.time) } : {}) } } : {}),
    ...(t.notes ? { notes: t.notes } : {}),
  };
}

export function serializeWorkspace(ws: Workspace): WorkspaceSnapshot {
  return {
    version: 1,
    compositions: ws.compositions.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), todoIds: [...c.todoIds] })),
    todos: ws.todos.map(serializeTodo),
    ...(ws.schedule ? { schedule: serializeSchedule(ws.schedule) } : {}),
    plans: { ...ws.plans },
    progress: ws.progress.map((p) => ({ ...p, updatedAt: p.updatedAt.toISOString() })),
    results: [...ws.results],
    ...(ws.report ? { report: ws.report } : {}),
    reflections: ws.reflections.map((r) => ({ ...r, answeredAt: r.answeredAt.toISOString() })),
    settings: { workingHours: ws.settings.workingHours.toJSON(), policy: { ...ws.settings.policy } },
  };
}

export function deserializeWorkspace(raw: unknown): Workspace {
  const snap = raw as WorkspaceSnapshot;
  if (!snap || snap.version !== 1) throw new DomainError("unsupported-workspace", `Unsupported workspace version: ${String((snap as { version?: unknown })?.version)}`);
  const todos: Todo[] = snap.todos.map(deserializeTodo);
  const workspace: Workspace = {
    version: 1,
    compositions: snap.compositions.map((c) => ({
      id: c.id,
      kind: c.kind as Composition["kind"],
      title: c.title,
      body: c.body,
      createdAt: new Date(c.createdAt),
      todoIds: [...c.todoIds],
    })),
    todos,
    plans: snap.plans as Workspace["plans"],
    progress: (snap.progress ?? []).map((p) => ({ todoId: p.todoId, step: p.step, done: p.done, note: p.note, updatedAt: new Date(p.updatedAt) })),
    results: snap.results as Workspace["results"],
    reflections: snap.reflections.map((r) => ({ todoId: r.todoId, question: r.question, answer: r.answer, answeredAt: new Date(r.answeredAt) })),
    settings: {
      workingHours: WorkingHours.fromJSON(snap.settings.workingHours),
      policy: snap.settings.policy as unknown as Workspace["settings"]["policy"],
    },
  };
  return {
    ...workspace,
    ...(snap.schedule ? { schedule: deserializeSchedule(snap.schedule) } : {}),
    ...(snap.report ? { report: snap.report as AchievementReport } : {}),
  };
}

function range(r: TimeRange): { start: string; end: string } {
  return { start: r.start.toISOString(), end: r.end.toISOString() };
}

export function serializeSchedule(s: Schedule): ScheduleSnapshot {
  return {
    generatedAt: s.generatedAt.toISOString(),
    horizon: range(s.horizon),
    blocks: s.blocks.map((b) => ({ todoId: b.todoId, range: range(b.range), part: { ...b.part } })),
    unscheduled: [...s.unscheduled],
    warnings: s.warnings.map((w) => {
      const out: Record<string, unknown> = { ...w };
      for (const k of ["deadlineAt", "finishesAt"] as const) {
        if (k in w) out[k] = (w as unknown as Record<string, Date>)[k]!.toISOString();
      }
      return out;
    }),
  };
}

export function deserializeSchedule(s: ScheduleSnapshot): Schedule {
  return {
    generatedAt: new Date(s.generatedAt),
    horizon: TimeRange.of(new Date(s.horizon.start), new Date(s.horizon.end)),
    blocks: s.blocks.map((b) => ({ todoId: b.todoId, range: TimeRange.of(new Date(b.range.start), new Date(b.range.end)), part: b.part })),
    unscheduled: s.unscheduled as Schedule["unscheduled"],
    warnings: s.warnings.map((w) => {
      const out = { ...w } as Record<string, unknown>;
      for (const k of ["deadlineAt", "finishesAt"]) if (typeof out[k] === "string") out[k] = new Date(out[k] as string);
      return out as unknown as ScheduleWarning;
    }),
  };
}
