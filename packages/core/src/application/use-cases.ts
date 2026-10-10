import { createComposition, type Composition } from "../composition/composition.js";
import { validateExecutionPlan, type ExecutionPlan } from "../execution/execution-plan.js";
import { updateStepProgress, type StepProgress, type StepProgressPatch } from "../execution/step-progress.js";
import { parseBraindump } from "../planning/braindump.js";
import { buildSchedule, type ScheduleRequest } from "../planning/scheduler.js";
import type { Schedule } from "../planning/schedule.js";
import type { Todo, TodoId } from "../planning/todo.js";
import type { AssistantContext, ChiefOfStaff, TodoRefinement } from "../ports/chief-of-staff.js";
import { applyProfilePatch, describeProfile, type Profile, type ProfilePatch } from "../profile/profile.js";
import { renderAchievementReport, renderExecutionPlan, renderResults, renderSchedule, renderStepNotes, renderTodos } from "../render/markdown.js";
import { validateAchievementReport, type AchievementReport, type ReflectionAnswer } from "../review/achievement-report.js";
import { parseResultReport, type TodoResult } from "../review/result-report.js";
import type { Clock } from "../shared/clock.js";
import type { IdGenerator } from "../shared/ids.js";
import { LocalDate } from "../shared/local-date.js";
import { DomainError } from "../shared/result.js";
import type { TimeRange } from "../shared/time-range.js";
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
  /** Ask the chief of staff to estimate/prioritise. Default true. */
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
  if (input.refine ?? true) {
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
  const schedule = buildSchedule({
    todos,
    workingHours: workspace.settings.workingHours,
    from: now,
    policy: { ...workspace.settings.policy, ...input.policy },
    ...(input.busy ? { busy: input.busy } : {}),
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
