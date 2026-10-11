import type { Composition } from "../composition/composition.js";
import type { ExecutionPlan } from "../execution/execution-plan.js";
import type { StepProgress } from "../execution/step-progress.js";
import { emptyProfile, type Profile } from "../profile/profile.js";
import { emptyCalendarState, type CalendarState } from "../calendar/calendar.js";
import { DEFAULT_POLICY, type Schedule, type SchedulingPolicy } from "../planning/schedule.js";
import type { Todo, TodoId } from "../planning/todo.js";
import { WorkingHours } from "../planning/working-hours.js";
import type { AchievementReport, ReflectionAnswer } from "../review/achievement-report.js";
import type { TodoResult } from "../review/result-report.js";

export interface WorkspaceSettings {
  readonly workingHours: WorkingHours;
  readonly policy: SchedulingPolicy;
}

/**
 * Everything one executive has in freenotes. Small enough to load and save whole,
 * which keeps persistence trivial (a JSON file, localStorage, …).
 */
export interface Workspace {
  readonly version: 1;
  readonly compositions: readonly Composition[];
  readonly todos: readonly Todo[];
  readonly schedule?: Schedule;
  readonly plans: Readonly<Record<TodoId, ExecutionPlan>>;
  /** Ticks and inline notes per execution-plan step. */
  readonly progress: readonly StepProgress[];
  readonly results: readonly TodoResult[];
  readonly report?: AchievementReport;
  readonly reflections: readonly ReflectionAnswer[];
  readonly profile: Profile;
  readonly calendar: CalendarState;
  readonly settings: WorkspaceSettings;
}

export function emptyWorkspace(settings?: Partial<WorkspaceSettings>): Workspace {
  return {
    version: 1,
    compositions: [],
    todos: [],
    plans: {},
    progress: [],
    results: [],
    reflections: [],
    profile: emptyProfile(),
    calendar: emptyCalendarState(),
    settings: {
      workingHours: settings?.workingHours ?? WorkingHours.default(),
      policy: settings?.policy ?? DEFAULT_POLICY,
    },
  };
}

/** Next free numeric suffix for todo codes ("T7" → 8). */
export function nextTodoNumber(workspace: Workspace): number {
  let max = 0;
  for (const t of workspace.todos) {
    const n = Number(/^T(\d+)$/.exec(t.id)?.[1] ?? 0);
    if (n > max) max = n;
  }
  return max + 1;
}

export function findTodo(workspace: Workspace, id: TodoId): Todo | undefined {
  return workspace.todos.find((t) => t.id === id);
}

export function resultFor(workspace: Workspace, id: TodoId): TodoResult | undefined {
  return workspace.results.find((r) => r.todoId === id);
}

/** Todos that still need time: no result yet, or reported partial/blocked. */
export function openTodos(workspace: Workspace): Todo[] {
  return workspace.todos.filter((t) => {
    const r = resultFor(workspace, t.id);
    return !r || r.status === "partial" || r.status === "blocked";
  });
}

export function withComposition(workspace: Workspace, composition: Composition): Workspace {
  return { ...workspace, compositions: [...workspace.compositions, composition] };
}
