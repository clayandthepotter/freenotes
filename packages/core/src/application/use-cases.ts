import { createComposition, type Composition } from "../composition/composition.js";
import { validateExecutionPlan, type ExecutionPlan } from "../execution/execution-plan.js";
import { updateStepProgress, type StepProgress, type StepProgressPatch } from "../execution/step-progress.js";
import { parseBraindump } from "../planning/braindump.js";
import { buildSchedule, type ScheduleRequest } from "../planning/scheduler.js";
import type { Schedule } from "../planning/schedule.js";
import type { Todo, TodoId } from "../planning/todo.js";
import type { AssistantContext, ChiefOfStaff, TodoRefinement } from "../ports/chief-of-staff.js";
import { applyProfilePatch, describeProfile, type Profile, type ProfilePatch } from "../profile/profile.js";
import { busyRanges, CALENDAR_PALETTE, CalendarError, normaliseFeedUrl, type CalendarEvent, type ConnectedCalendar } from "../calendar/calendar.js";
import { parseIcs } from "../calendar/ics.js";
import type { CalendarFeedFetcher } from "../ports/calendar-feeds.js";
import type { ExternalIssue } from "../issues/issue.js";
import { createTodo, type Deadline, type Priority } from "../planning/todo.js";
import { TimeRange } from "../shared/time-range.js";
import { renderAchievementReport, renderExecutionPlan, renderResults, renderSchedule, renderStepNotes, renderTodos } from "../render/markdown.js";
import { validateAchievementReport, type AchievementReport, type ReflectionAnswer } from "../review/achievement-report.js";
import { parseResultReport, type TodoResult } from "../review/result-report.js";
import type { Clock } from "../shared/clock.js";
import type { IdGenerator } from "../shared/ids.js";
import { LocalDate, LocalTime } from "../shared/local-date.js";

const LocalTime0 = LocalTime.of(0);
import { DomainError } from "../shared/result.js";
import { findTodo, nextTodoNumber, openTodos, withComposition, type Workspace } from "../workspace/workspace.js";

/**
 * Use cases are pure functions over the workspace: (workspace, input, deps) → (workspace', output).
 * Persistence and transport live outside; the facade in ./freenotes.ts wires them.
 */
export interface UseCaseDeps {
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly chiefOfStaff: ChiefOfStaff;
  readonly profile?: string;
}

function context(deps: UseCaseDeps, workspace: Workspace): AssistantContext {
  const profile = [deps.profile?.trim(), describeProfile(workspace.profile)].filter(Boolean).join("\n");
  return { today: LocalDate.fromDate(deps.clock.now()), ...(profile ? { profile } : {}) };
}

// ---------------------------------------------------------------------------------------------
// 1. Capture a braindump → todos

export interface CaptureBraindumpInput {
  readonly text: string;
  readonly title?: string;
  /** Ask the chief of staff to estimate and prioritise straight away. Default false: nothing is assumed until the executive is asked. */
  readonly refine?: boolean;
}

export interface CaptureBraindumpOutput {
  readonly workspace: Workspace;
  readonly composition: Composition;
  readonly todos: readonly Todo[];
  readonly refinements: readonly TodoRefinement[];
  readonly ignoredLines: readonly string[];
}

export async function captureBraindump(workspace: Workspace, input: CaptureBraindumpInput, deps: UseCaseDeps): Promise<CaptureBraindumpOutput> {
  const now = deps.clock.now();
  const ctx = context(deps, workspace);
  const parsed = parseBraindump(input.text, { today: ctx.today, startAt: nextTodoNumber(workspace) });
  if (parsed.todos.length === 0) throw new DomainError("empty-braindump", "No todos found. Write one per line, e.g. \"- Finish the deck by Friday ~2h\".");

  let todos = parsed.todos;
  let refinements: readonly TodoRefinement[] = [];
  if (input.refine ?? false) {
    refinements = await deps.chiefOfStaff.refineTodos({ todos, rawBraindump: input.text, context: ctx });
    todos = applyRefinements(todos, refinements);
  }

  const composition = createComposition(deps.ids.next(), now, {
    kind: "braindump",
    title: input.title ?? `Braindump · ${ctx.today}`,
    body: `${input.text.trim()}\n\n---\n\n${renderTodos(todos, refinements)}`,
    todoIds: todos.map((t) => t.id),
  });

  return {
    workspace: withComposition({ ...workspace, todos: [...workspace.todos, ...todos] }, composition),
    composition,
    todos,
    refinements,
    ignoredLines: parsed.ignoredLines,
  };
}

export function applyRefinements(todos: readonly Todo[], refinements: readonly TodoRefinement[]): Todo[] {
  const byId = new Map(refinements.map((r) => [r.todoId, r] as const));
  return todos.map((t) => {
    const r = byId.get(t.id);
    if (!r) return t;
    const estimate = t.estimateSource === "explicit" ? undefined : r.estimatedMinutes; // never override what the user typed
    return {
      ...t,
      ...(estimate && estimate > 0 ? { estimatedMinutes: Math.round(estimate), estimateSource: "assistant" as const } : {}),
      ...(r.priority ? { priority: r.priority } : {}),
      ...(r.clarifiedTitle?.trim() ? { title: r.clarifiedTitle.trim() } : {}),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// 1b. Triage: when is it due, how much time to budget

export interface TriageInput {
  readonly todoId: TodoId;
  /** A deadline, or null for "no deadline, fit it in a gap". Omit to leave as is. */
  readonly deadline?: Deadline | null;
  /** Minutes to budget, or "assistant" to have the chief of staff estimate. Omit to leave as is. */
  readonly estimate?: number | "assistant";
  readonly priority?: Priority;
}

export interface TriageOutput {
  readonly workspace: Workspace;
  readonly todo: Todo;
  readonly refinement?: TodoRefinement;
}

export async function triageTodo(workspace: Workspace, input: TriageInput, deps: UseCaseDeps): Promise<TriageOutput> {
  const current = findTodo(workspace, input.todoId);
  if (!current) throw new DomainError("unknown-todo", `No todo ${input.todoId}`);
  let todo: Todo = { ...current, triagedAt: deps.clock.now() };
  if (input.deadline !== undefined) {
    const { deadline: _drop, ...rest } = todo;
    todo = input.deadline ? { ...rest, deadline: input.deadline } : rest;
  }
  if (input.priority) todo = { ...todo, priority: input.priority };
  let refinement: TodoRefinement | undefined;
  if (typeof input.estimate === "number") {
    if (!Number.isFinite(input.estimate) || input.estimate <= 0) throw new DomainError("invalid-estimate", "Budget a positive number of minutes.");
    todo = { ...todo, estimatedMinutes: Math.round(input.estimate), estimateSource: "explicit" };
  } else if (input.estimate === "assistant") {
    // Asked explicitly, so an estimate written in the note is up for replacement too.
    const [r] = await deps.chiefOfStaff.refineTodos({ todos: [{ ...todo, estimateSource: "default" }], rawBraindump: `- ${todo.title}`, context: context(deps, workspace) });
    if (r?.estimatedMinutes && r.estimatedMinutes > 0) {
      todo = { ...todo, estimatedMinutes: Math.round(r.estimatedMinutes), estimateSource: "assistant" };
      refinement = r;
    }
  }
  const todos = workspace.todos.map((t) => (t.id === todo.id ? todo : t));
  return { workspace: { ...workspace, todos }, todo, ...(refinement ? { refinement } : {}) };
}

// ---------------------------------------------------------------------------------------------
// 2. Build the time-blocked schedule

export interface BuildScheduleInput {
  readonly busy?: readonly TimeRange[];
  readonly policy?: ScheduleRequest["policy"];
}

export interface BuildScheduleOutput {
  readonly workspace: Workspace;
  readonly schedule: Schedule;
  readonly composition: Composition;
}

export function scheduleWorkspace(workspace: Workspace, input: BuildScheduleInput, deps: Pick<UseCaseDeps, "clock" | "ids">): BuildScheduleOutput {
  const now = deps.clock.now();
  const todos = openTodos(workspace);
  const policy = { ...workspace.settings.policy, ...input.policy };
  const horizon = TimeRange.of(now, new Date(now.getTime() + policy.horizonDays * 86_400_000));
  const busy = [...(input.busy ?? []), ...busyRanges(workspace.calendar.events, horizon)];
  const schedule = buildSchedule({
    todos,
    workingHours: workspace.settings.workingHours,
    from: now,
    policy,
    ...(busy.length ? { busy } : {}),
  });
  const composition = createComposition(deps.ids.next(), now, {
    kind: "schedule",
    title: `Schedule · ${LocalDate.fromDate(now)}`,
    body: renderSchedule(schedule, workspace.todos),
    todoIds: todos.map((t) => t.id),
  });
  return { workspace: withComposition({ ...workspace, schedule }, composition), schedule, composition };
}

// ---------------------------------------------------------------------------------------------
// 3. Decompose a todo into execution parameters

export interface PlanExecutionOutput {
  readonly workspace: Workspace;
  readonly plan: ExecutionPlan;
  readonly composition: Composition;
}

export async function planExecution(workspace: Workspace, todoId: TodoId, deps: UseCaseDeps): Promise<PlanExecutionOutput> {
  const todo = findTodo(workspace, todoId);
  if (!todo) throw new DomainError("unknown-todo", `No todo ${todoId}`);
  const plan = validateExecutionPlan(
    await deps.chiefOfStaff.planExecution({
      todo,
      otherTodos: workspace.todos.filter((t) => t.id !== todoId),
      ...(workspace.schedule ? { schedule: workspace.schedule } : {}),
      context: context(deps, workspace),
    }),
  );
  const composition = createComposition(deps.ids.next(), deps.clock.now(), {
    kind: "execution-plan",
    title: `Plan · ${todo.id} ${todo.title}`,
    body: renderExecutionPlan(plan, todo),
    todoIds: [todo.id],
  });
  return { workspace: withComposition({ ...workspace, plans: { ...workspace.plans, [todo.id]: plan } }, composition), plan, composition };
}

// ---------------------------------------------------------------------------------------------
// 3b. Work a plan: tick steps and write inline

export function recordStepProgress(workspace: Workspace, patch: StepProgressPatch, deps: Pick<UseCaseDeps, "clock">): { workspace: Workspace; progress: readonly StepProgress[] } {
  const plan = workspace.plans[patch.todoId];
  if (!findTodo(workspace, patch.todoId)) throw new DomainError("unknown-todo", `No todo ${patch.todoId}`);
  if (!plan) throw new DomainError("no-plan", `${patch.todoId} has no execution plan yet.`);
  if (!Number.isInteger(patch.step) || patch.step < 1 || patch.step > plan.steps.length) throw new DomainError("unknown-step", `${patch.todoId} has no step ${patch.step}.`);
  const progress = updateStepProgress(workspace.progress, patch, deps.clock.now());
  return { workspace: { ...workspace, progress }, progress };
}

// ---------------------------------------------------------------------------------------------
// 4. Record results

export interface RecordResultsOutput {
  readonly workspace: Workspace;
  readonly results: readonly TodoResult[];
  readonly unmatchedLines: readonly string[];
  readonly composition: Composition;
}

export function recordResults(workspace: Workspace, text: string, deps: Pick<UseCaseDeps, "clock" | "ids">): RecordResultsOutput {
  const parsed = parseResultReport(text, workspace.todos);
  if (parsed.results.length === 0) throw new DomainError("no-results", "No results matched your todos. Reference them by code, e.g. \"T1: done — shipped it\".");
  const merged = new Map(workspace.results.map((r) => [r.todoId, r] as const));
  for (const r of parsed.results) merged.set(r.todoId, r);
  const stepNotes = renderStepNotes(workspace.progress, workspace.todos, workspace.plans, parsed.results.map((r) => r.todoId));
  const composition = createComposition(deps.ids.next(), deps.clock.now(), {
    kind: "results",
    title: `Results · ${LocalDate.fromDate(deps.clock.now())}`,
    body: `${text.trim()}\n\n---\n\n${renderResults(parsed.results, workspace.todos, parsed.unmatchedLines)}${stepNotes ? `\n\n### Written while executing\n\n${stepNotes}` : ""}`,
    todoIds: parsed.results.map((r) => r.todoId),
  });
  return {
    workspace: withComposition({ ...workspace, results: [...merged.values()] }, composition),
    results: parsed.results,
    unmatchedLines: parsed.unmatchedLines,
    composition,
  };
}

// ---------------------------------------------------------------------------------------------
// 5. Compose the achievement report

export interface ComposeReportOutput {
  readonly workspace: Workspace;
  readonly report: AchievementReport;
  readonly composition: Composition;
}

export async function composeAchievementReport(workspace: Workspace, deps: UseCaseDeps): Promise<ComposeReportOutput> {
  if (workspace.results.length === 0) throw new DomainError("no-results", "Record results before asking for an achievement report.");
  const rawResults = workspace.compositions.filter((c) => c.kind === "results").map((c) => c.body).join("\n\n");
  const completed = workspace.results.filter((r) => r.status === "done").map((r) => r.todoId);
  const report = validateAchievementReport(
    await deps.chiefOfStaff.composeAchievementReport({
      todos: workspace.todos,
      results: workspace.results,
      rawResults,
      plans: workspace.plans,
      ...(workspace.schedule ? { schedule: workspace.schedule } : {}),
      context: context(deps, workspace),
    }),
    completed,
  );
  const composition = createComposition(deps.ids.next(), deps.clock.now(), {
    kind: "achievement-report",
    title: `Achievement report · ${LocalDate.fromDate(deps.clock.now())}`,
    body: renderAchievementReport(report, workspace.todos, workspace.reflections),
    todoIds: report.achievements.map((a) => a.todoId),
  });
  return { workspace: withComposition({ ...workspace, report }, composition), report, composition };
}

// ---------------------------------------------------------------------------------------------
// 6. Answer a reflection question

export function answerReflection(workspace: Workspace, todoId: TodoId, answer: string, deps: Pick<UseCaseDeps, "clock">): { workspace: Workspace; reflection: ReflectionAnswer } {
  const question = workspace.report?.reflections.find((r) => r.todoId === todoId);
  if (!question) throw new DomainError("no-question", `There is no open reflection question for ${todoId}. Compose an achievement report first.`);
  if (!answer.trim()) throw new DomainError("empty-answer", "An answer cannot be empty.");
  const reflection: ReflectionAnswer = { todoId, question: question.question, answer: answer.trim(), answeredAt: deps.clock.now() };
  const reflections = [...workspace.reflections.filter((r) => r.todoId !== todoId), reflection];
  return { workspace: { ...workspace, reflections }, reflection };
}

// ---------------------------------------------------------------------------------------------
// 7. Who the executive is

export function updateProfile(workspace: Workspace, patch: ProfilePatch): { workspace: Workspace; profile: Profile } {
  const profile = applyProfilePatch(workspace.profile, patch);
  return { workspace: { ...workspace, profile }, profile };
}

// ---------------------------------------------------------------------------------------------
// 8. Calendars: connect feeds, pull events, treat them as busy time

export interface ConnectCalendarInput {
  readonly label: string;
  readonly url: string;
  readonly color?: string;
}

export function connectCalendar(workspace: Workspace, input: ConnectCalendarInput, deps: Pick<UseCaseDeps, "ids">): { workspace: Workspace; calendar: ConnectedCalendar } {
  const url = normaliseFeedUrl(input.url);
  if (workspace.calendar.calendars.some((c) => c.source.url === url)) throw new CalendarError("duplicate", "That calendar is already connected.");
  const label = input.label.trim() || `Calendar ${workspace.calendar.calendars.length + 1}`;
  const color = input.color ?? CALENDAR_PALETTE[workspace.calendar.calendars.length % CALENDAR_PALETTE.length]!;
  const calendar: ConnectedCalendar = { id: deps.ids.next(), label, color, source: { kind: "ics", url } };
  return { workspace: { ...workspace, calendar: { ...workspace.calendar, calendars: [...workspace.calendar.calendars, calendar] } }, calendar };
}

export function removeCalendar(workspace: Workspace, calendarId: string): Workspace {
  if (!workspace.calendar.calendars.some((c) => c.id === calendarId)) throw new CalendarError("unknown-calendar", "No such calendar.");
  return {
    ...workspace,
    calendar: {
      ...workspace.calendar,
      calendars: workspace.calendar.calendars.filter((c) => c.id !== calendarId),
      events: workspace.calendar.events.filter((e) => e.calendarId !== calendarId),
    },
  };
}

/** The window freenotes keeps events for: sixty days back (so relationships can be read) through the scheduling horizon plus a week. */
export function calendarWindow(workspace: Workspace, now: Date): TimeRange {
  const start = LocalDate.fromDate(now).addDays(-60).at(LocalTime0);
  const end = LocalDate.fromDate(now).addDays(workspace.settings.policy.horizonDays + 7).at(LocalTime0);
  return TimeRange.of(start, end);
}

export interface SyncCalendarsOutput {
  readonly workspace: Workspace;
  readonly synced: readonly string[];
  readonly failed: ReadonlyArray<{ calendarId: string; error: string }>;
}

/** Pulls every connected feed. A feed that fails keeps its last events and records the error; the rest still sync. */
export async function syncCalendars(workspace: Workspace, deps: Pick<UseCaseDeps, "clock"> & { feeds: CalendarFeedFetcher }): Promise<SyncCalendarsOutput> {
  const now = deps.clock.now();
  const window = calendarWindow(workspace, now);
  const synced: string[] = [];
  const failed: Array<{ calendarId: string; error: string }> = [];
  let events: CalendarEvent[] = [];
  const calendars: ConnectedCalendar[] = [];
  for (const c of workspace.calendar.calendars) {
    try {
      const text = await deps.feeds.fetchIcs(c.source.url);
      events = [...events, ...parseIcs(text, { calendarId: c.id, window })];
      const { lastError: _dropped, ...rest } = c;
      calendars.push({ ...rest, lastSyncedAt: now });
      synced.push(c.id);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      events = [...events, ...workspace.calendar.events.filter((x) => x.calendarId === c.id)];
      calendars.push({ ...c, lastError: error });
      failed.push({ calendarId: c.id, error });
    }
  }
  return { workspace: { ...workspace, calendar: { calendars, events, window } }, synced, failed };
}

// ---------------------------------------------------------------------------------------------
// 9. Issues from an external tracker become todos; work closed there closes here

export interface ImportIssuesOutput {
  readonly workspace: Workspace;
  readonly added: readonly Todo[];
  readonly closed: readonly TodoId[];
  readonly composition?: Composition;
}

const ISSUE_PRIORITY: Record<ExternalIssue["priority"], Priority> = { 0: "normal", 1: "high", 2: "high", 3: "normal", 4: "low" };

/**
 * Mirrors the issues assigned to the executive. New open issues become todos (code, title, due
 * date, estimate from points, priority); issues already mirrored are left alone, except that one
 * completed or cancelled in the tracker records a result here. Nothing is ever written back.
 */
export function importIssues(workspace: Workspace, issues: readonly ExternalIssue[], deps: Pick<UseCaseDeps, "clock" | "ids">, options: { minutesPerPoint?: number } = {}): ImportIssuesOutput {
  const minutesPerPoint = options.minutesPerPoint ?? 60;
  const byExternal = new Map(workspace.todos.filter((t) => t.external).map((t) => [`${t.external!.source}:${t.external!.id}`, t] as const));
  const resultOf = (id: TodoId) => workspace.results.find((r) => r.todoId === id);
  const added: Todo[] = [];
  const closed: TodoId[] = [];
  let results = [...workspace.results];
  let next = nextTodoNumber(workspace);

  for (const issue of issues) {
    const existing = byExternal.get(`${issue.source}:${issue.id}`);
    const open = issue.state === "todo" || issue.state === "in-progress";
    if (existing) {
      if (!open && !["done", "skipped"].includes(resultOf(existing.id)?.status ?? "")) {
        const status = issue.state === "done" ? "done" : "skipped";
        results = [...results.filter((r) => r.todoId !== existing.id), { todoId: existing.id, status, notes: `${issue.identifier} ${status === "done" ? "completed" : "cancelled"} in ${issue.source}` }];
        closed.push(existing.id);
      }
      continue;
    }
    if (!open) continue;
    const todo = createTodo(`T${next++}`, workspace.todos.length + added.length, {
      title: `${issue.identifier} ${issue.title}`,
      priority: ISSUE_PRIORITY[issue.priority],
      ...(issue.estimatePoints ? { estimatedMinutes: Math.max(15, Math.round(issue.estimatePoints * minutesPerPoint)) } : {}),
      ...(issue.dueDate ? { deadline: { date: issue.dueDate } } : {}),
      notes: [issue.project ? `Project: ${issue.project}` : "", issue.url].filter(Boolean).join("\n"),
      external: { source: issue.source, id: issue.id, identifier: issue.identifier, url: issue.url },
    });
    added.push(todo);
  }

  let ws: Workspace = { ...workspace, todos: [...workspace.todos, ...added], results };
  let composition: Composition | undefined;
  if (added.length > 0 || closed.length > 0) {
    const lines = [
      ...added.map((t) => `- ${t.title}${t.deadline ? ` by ${t.deadline.date.toString()}` : ""} ~${t.estimatedMinutes}m [${t.priority}]`),
      ...closed.map((id) => `- ${id} closed in the tracker`),
    ];
    composition = createComposition(deps.ids.next(), deps.clock.now(), {
      kind: "braindump",
      title: `Imported from ${issues[0]?.source ?? "tracker"} · ${LocalDate.fromDate(deps.clock.now())}`,
      body: `${lines.join("\n")}\n\n---\n\n${renderTodos(added)}`,
      todoIds: [...added.map((t) => t.id), ...closed],
    });
    ws = withComposition(ws, composition);
  }
  return { workspace: ws, added, closed, ...(composition ? { composition } : {}) };
}
