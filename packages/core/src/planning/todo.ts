import { DomainError } from "../shared/result.js";
import type { LocalDate, LocalTime } from "../shared/local-date.js";
import type { ExternalLink } from "../issues/issue.js";

/** Human-facing todo code such as "T1". Stable for the life of a workspace. */
export type TodoId = string;

export type Priority = "high" | "normal" | "low";

export const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

export type EstimateSource = "explicit" | "default" | "assistant";

/**
 * When a commitment must be delivered. A date-only deadline means
 * "by the end of the working day"; the scheduler resolves it against working hours.
 */
export interface Deadline {
  readonly date: LocalDate;
  readonly time?: LocalTime;
}

export const DEFAULT_ESTIMATE_MINUTES = 30;

export interface Todo {
  readonly id: TodoId;
  readonly title: string;
  readonly order: number; // position in the braindump; used as the final tie-breaker
  readonly priority: Priority;
  readonly estimatedMinutes: number;
  readonly estimateSource: EstimateSource;
  readonly deadline?: Deadline;
  readonly notes?: string;
  /** Set when the todo mirrors an issue in an external tracker. */
  readonly external?: ExternalLink;
  /** Set once the executive has answered (or declined) the due-date and time-budget questions. */
  readonly triagedAt?: Date;
}

/**
 * A freshly captured todo is only a line of text. Before it is scheduled the executive is asked
 * when it is due and how much time to budget; nothing is assumed on their behalf until they say so.
 */
export function needsTriage(todo: Todo): boolean {
  if (todo.triagedAt) return false;
  return todo.estimateSource !== "explicit" || !todo.deadline;
}

export interface TodoDraft {
  title: string;
  priority?: Priority;
  estimatedMinutes?: number;
  deadline?: Deadline;
  notes?: string;
  external?: ExternalLink;
  triagedAt?: Date;
}

export function createTodo(id: TodoId, order: number, draft: TodoDraft): Todo {
  const title = draft.title.trim();
  if (!title) throw new DomainError("empty-title", "A todo needs a title");
  if (draft.estimatedMinutes !== undefined && (draft.estimatedMinutes <= 0 || !Number.isFinite(draft.estimatedMinutes))) {
    throw new DomainError("invalid-estimate", `Estimate must be a positive number of minutes, got ${draft.estimatedMinutes}`);
  }
  const todo: Todo = {
    id,
    title,
    order,
    priority: draft.priority ?? "normal",
    estimatedMinutes: draft.estimatedMinutes ?? DEFAULT_ESTIMATE_MINUTES,
    estimateSource: draft.estimatedMinutes === undefined ? "default" : "explicit",
    ...(draft.deadline ? { deadline: draft.deadline } : {}),
    ...(draft.notes ? { notes: draft.notes } : {}),
    ...(draft.external ? { external: draft.external } : {}),
    ...(draft.triagedAt ? { triagedAt: draft.triagedAt } : {}),
  };
  return todo;
}

/** Comparator: higher priority first, then braindump order. */
export function byPriorityThenOrder(a: Todo, b: Todo): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order;
}

export function hasDeadline(todo: Todo): todo is Todo & { deadline: Deadline } {
  return todo.deadline !== undefined;
}
