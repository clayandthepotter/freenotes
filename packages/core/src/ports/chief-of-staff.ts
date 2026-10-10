import type { LocalDate } from "../shared/local-date.js";
import type { ExecutionPlan } from "../execution/execution-plan.js";
import type { Schedule } from "../planning/schedule.js";
import type { Priority, Todo, TodoId } from "../planning/todo.js";
import type { AchievementReport } from "../review/achievement-report.js";
import type { TodoResult } from "../review/result-report.js";

export interface AssistantContext {
  readonly today: LocalDate;
  /** Free-form background the executive wants the assistant to know (role, goals, constraints). */
  readonly profile?: string;
}

export interface TodoRefinement {
  readonly todoId: TodoId;
  readonly estimatedMinutes?: number;
  readonly priority?: Priority;
  readonly clarifiedTitle?: string;
  readonly rationale?: string;
}

export interface RefineTodosRequest {
  readonly todos: readonly Todo[];
  readonly rawBraindump: string;
  readonly context: AssistantContext;
}

export interface PlanExecutionRequest {
  readonly todo: Todo;
  readonly schedule?: Schedule;
  readonly otherTodos: readonly Todo[];
  readonly context: AssistantContext;
}

export interface ComposeReportRequest {
  readonly todos: readonly Todo[];
  readonly results: readonly TodoResult[];
  readonly rawResults: string;
  readonly schedule?: Schedule;
  readonly plans: Readonly<Record<TodoId, ExecutionPlan>>;
  readonly context: AssistantContext;
}

/**
 * The chief of staff role. Implementations: a Claude-backed adapter and a deterministic
 * heuristic adapter (used offline, in tests, and as a fallback).
 */
export interface ChiefOfStaff {
  readonly name: string;
  /** Sharpen titles, estimate effort and set priority for freshly captured todos. */
  refineTodos(request: RefineTodosRequest): Promise<readonly TodoRefinement[]>;
  /** Decompose one todo into step-by-step execution parameters. */
  planExecution(request: PlanExecutionRequest): Promise<ExecutionPlan>;
  /** Turn reported results into an achievement report with improvements and reflection questions. */
  composeAchievementReport(request: ComposeReportRequest): Promise<AchievementReport>;
}
