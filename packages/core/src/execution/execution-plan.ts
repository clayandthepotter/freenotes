import { DomainError } from "../shared/result.js";
import type { TodoId } from "../planning/todo.js";

export interface ExecutionStep {
  readonly order: number; // 1-based
  readonly action: string; // imperative, concrete: "Open last quarter's deck and copy the structure"
  readonly detail?: string; // how / what good looks like for this step
  readonly estimatedMinutes?: number;
}

/**
 * Step-by-step execution parameters for one todo. The chief of staff prepares it;
 * the executive executes it. Everything here should be actionable without further thinking.
 */
export interface ExecutionPlan {
  readonly todoId: TodoId;
  readonly objective: string; // what "done" produces, in one sentence
  readonly definitionOfDone: readonly string[]; // observable checks
  readonly steps: readonly ExecutionStep[];
  readonly inputs: readonly string[]; // things to have at hand before starting
  readonly risks: readonly string[]; // what tends to go wrong + the mitigation
  readonly firstAction: string; // the very first physical action, to beat procrastination
  readonly source: "assistant" | "heuristic";
}

export function validateExecutionPlan(plan: ExecutionPlan): ExecutionPlan {
  if (!plan.objective.trim()) throw new DomainError("invalid-plan", `Plan for ${plan.todoId} has no objective`);
  if (plan.steps.length === 0) throw new DomainError("invalid-plan", `Plan for ${plan.todoId} has no steps`);
  plan.steps.forEach((s, i) => {
    if (s.order !== i + 1) throw new DomainError("invalid-plan", `Plan for ${plan.todoId}: step ${i + 1} has order ${s.order}`);
    if (!s.action.trim()) throw new DomainError("invalid-plan", `Plan for ${plan.todoId}: step ${s.order} has no action`);
  });
  if (!plan.firstAction.trim()) throw new DomainError("invalid-plan", `Plan for ${plan.todoId} has no first action`);
  return plan;
}

export function totalPlannedMinutes(plan: ExecutionPlan): number | undefined {
  const withEstimates = plan.steps.filter((s) => s.estimatedMinutes !== undefined);
  if (withEstimates.length === 0) return undefined;
  return withEstimates.reduce((sum, s) => sum + (s.estimatedMinutes ?? 0), 0);
}
