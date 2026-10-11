import { LocalDate, LocalTime } from "../shared/local-date.js";
import { TimeRange } from "../shared/time-range.js";
import { WorkingHours } from "../planning/working-hours.js";
import type { Todo } from "../planning/todo.js";
import type { Schedule, ScheduleWarning } from "../planning/schedule.js";
import type { Workspace } from "./workspace.js";
import type { Composition } from "../composition/composition.js";
import type { AchievementReport } from "../review/achievement-report.js";
import { DomainError } from "../shared/result.js";
import { emptyProfile } from "../profile/profile.js";
import type { WorkingStyle } from "../profile/working-style.js";
import { emptyCalendarState, type CalendarEvent, type ConnectedCalendar } from "../calendar/calendar.js";

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
  /** Optional for snapshots written before profiles existed. */
  profile?: { name?: string; style?: unknown; goals: string[]; boundaries: string[]; onboardedAt?: string };
  /** Optional for snapshots written before calendars existed. */
  calendar?: {
    calendars: Array<{ id: string; label: string; color: string; source: { kind: "ics"; url: string }; lastSyncedAt?: string; lastError?: string }>;
    events: Array<{ calendarId: string; uid: string; title: string; start: string; end: string; allDay: boolean; location?: string; attendees: string[]; status: string; transparent: boolean }>;
    window?: { start: string; end: string };
  };
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
    profile: {
      ...(ws.profile.name ? { name: ws.profile.name } : {}),
      ...(ws.profile.style ? { style: ws.profile.style } : {}),
      goals: [...ws.profile.goals],
      boundaries: [...ws.profile.boundaries],
      ...(ws.profile.onboardedAt ? { onboardedAt: ws.profile.onboardedAt.toISOString() } : {}),
    },
    calendar: {
      calendars: ws.calendar.calendars.map((c) => ({
        id: c.id,
        label: c.label,
        color: c.color,
        source: { ...c.source },
        ...(c.lastSyncedAt ? { lastSyncedAt: c.lastSyncedAt.toISOString() } : {}),
        ...(c.lastError ? { lastError: c.lastError } : {}),
      })),
      events: ws.calendar.events.map((e) => ({
        calendarId: e.calendarId,
        uid: e.uid,
        title: e.title,
        start: e.range.start.toISOString(),
        end: e.range.end.toISOString(),
        allDay: e.allDay,
        ...(e.location ? { location: e.location } : {}),
        attendees: [...e.attendees],
        status: e.status,
        transparent: e.transparent,
      })),
      ...(ws.calendar.window ? { window: range(ws.calendar.window) } : {}),
    },
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
    profile: snap.profile
      ? {
          ...(snap.profile.name ? { name: snap.profile.name } : {}),
          ...(snap.profile.style ? { style: snap.profile.style as WorkingStyle } : {}),
          goals: [...(snap.profile.goals ?? [])],
          boundaries: [...(snap.profile.boundaries ?? [])],
          ...(snap.profile.onboardedAt ? { onboardedAt: new Date(snap.profile.onboardedAt) } : {}),
        }
      : emptyProfile(),
    calendar: snap.calendar
      ? {
          calendars: snap.calendar.calendars.map(
            (c): ConnectedCalendar => ({
              id: c.id,
              label: c.label,
              color: c.color,
              source: { kind: "ics", url: c.source.url },
              ...(c.lastSyncedAt ? { lastSyncedAt: new Date(c.lastSyncedAt) } : {}),
              ...(c.lastError ? { lastError: c.lastError } : {}),
            }),
          ),
          events: snap.calendar.events.map(
            (e): CalendarEvent => ({
              calendarId: e.calendarId,
              uid: e.uid,
              title: e.title,
              range: TimeRange.of(new Date(e.start), new Date(e.end)),
              allDay: e.allDay,
              ...(e.location ? { location: e.location } : {}),
              attendees: [...e.attendees],
              status: e.status as CalendarEvent["status"],
              transparent: e.transparent,
            }),
          ),
          ...(snap.calendar.window ? { window: TimeRange.of(new Date(snap.calendar.window.start), new Date(snap.calendar.window.end)) } : {}),
        }
      : emptyCalendarState(),
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
