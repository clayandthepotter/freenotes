import { MINUTE_MS, TimeRange, subtractAll } from "../shared/time-range.js";
import { LocalDate } from "../shared/local-date.js";
import {
  DEFAULT_POLICY,
  type Schedule,
  type ScheduleWarning,
  type SchedulingPolicy,
  type TimeBlock,
  type UnscheduledTodo,
} from "./schedule.js";
import { PRIORITY_RANK, byPriorityThenOrder, hasDeadline, type Deadline, type Todo } from "./todo.js";
import type { WorkingHours } from "./working-hours.js";

export interface ScheduleRequest {
  readonly todos: readonly Todo[];
  readonly workingHours: WorkingHours;
  /** Scheduling starts here (usually "now"); nothing is placed in the past. */
  readonly from: Date;
  readonly policy?: Partial<SchedulingPolicy>;
  /** Existing commitments (meetings, etc.) that must not be double-booked. */
  readonly busy?: readonly TimeRange[];
}

/** Resolves a deadline to an instant; date-only deadlines mean the end of that working day. */
export function deadlineInstant(deadline: Deadline, workingHours: WorkingHours): Date {
  return deadline.time ? deadline.date.at(deadline.time) : workingHours.endOfDay(deadline.date);
}

/**
 * Builds a time-blocked schedule.
 *
 * 1. Todos with a deadline are placed first, earliest deadline first (EDF), each as early as possible.
 *    If a todo cannot finish before its deadline the schedule still places it, but flags it as at risk —
 *    an executive would rather see the problem than have it hidden.
 * 2. Todos without a deadline are then fitted into the remaining gaps, by priority then braindump order.
 *
 * Long todos are split into focus blocks no longer than `maxBlockMinutes`, each followed by a break.
 * The algorithm is deterministic: same inputs, same schedule.
 */
export function buildSchedule(request: ScheduleRequest): Schedule {
  const policy: SchedulingPolicy = { ...DEFAULT_POLICY, ...request.policy };
  validatePolicy(policy);

  const from = snapUp(request.from, policy.granularityMinutes);
  const horizonEnd = LocalDate.fromDate(from).addDays(policy.horizonDays).startOfDay();
  const horizon = TimeRange.of(from, horizonEnd);

  let free = subtractAll(request.workingHours.windowsBetween(from, horizonEnd), request.busy ?? []);

  const blocks: TimeBlock[] = [];
  const unscheduled: UnscheduledTodo[] = [];
  const warnings: ScheduleWarning[] = [];

  const dated = request.todos.filter(hasDeadline).sort((a, b) => {
    const da = deadlineInstant(a.deadline, request.workingHours).getTime();
    const db = deadlineInstant(b.deadline, request.workingHours).getTime();
    return da - db || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.order - b.order;
  });
  const flexible = request.todos.filter((t) => !hasDeadline(t)).sort(byPriorityThenOrder);

  for (const todo of [...dated, ...flexible]) {
    const placed = allocate(todo, free, policy);
    free = placed.free;
    blocks.push(...placed.blocks);
    if (placed.remainingMinutes > 0) {
      unscheduled.push({ todoId: todo.id, remainingMinutes: placed.remainingMinutes, reason: "no-capacity-in-horizon" });
    }
    if (hasDeadline(todo)) {
      const deadlineAt = deadlineInstant(todo.deadline, request.workingHours);
      const finishesAt = placed.blocks.at(-1)?.range.end;
      if (deadlineAt <= from) {
        warnings.push({ kind: "deadline-passed", todoId: todo.id, deadlineAt });
      } else if (placed.remainingMinutes > 0 || (finishesAt && finishesAt > deadlineAt)) {
        warnings.push({ kind: "deadline-at-risk", todoId: todo.id, deadlineAt, finishesAt: finishesAt ?? horizonEnd });
      }
    }
  }

  blocks.sort((a, b) => a.range.start.getTime() - b.range.start.getTime());
  return { generatedAt: request.from, horizon, blocks, unscheduled, warnings };
}

interface Allocation {
  blocks: TimeBlock[];
  free: TimeRange[];
  remainingMinutes: number;
}

function allocate(todo: Todo, free: TimeRange[], policy: SchedulingPolicy): Allocation {
  const g = policy.granularityMinutes;
  let remaining = roundUp(todo.estimatedMinutes, g);
  const ranges: TimeRange[] = [];
  const nextFree: TimeRange[] = [];

  for (const slot of free) {
    if (remaining <= 0) {
      nextFree.push(slot);
      continue;
    }
    let cursor = slot.start;
    while (remaining > 0) {
      const available = Math.floor((slot.end.getTime() - cursor.getTime()) / MINUTE_MS / g) * g;
      if (available < g) break;
      const take = Math.min(remaining, policy.maxBlockMinutes, available);
      const block = TimeRange.ofMinutes(cursor, take);
      ranges.push(block);
      remaining -= take;
      cursor = new Date(block.end.getTime() + policy.breakMinutes * MINUTE_MS);
      if (remaining > 0 && cursor >= slot.end) break;
    }
    // Whatever is left of the slot stays free for later todos (a sliver shorter than the granularity is dropped).
    const leftoverStart = snapUp(cursor, g);
    if (leftoverStart < slot.end) nextFree.push(TimeRange.of(leftoverStart, slot.end));
  }

  const blocks = ranges.map((range, i) => ({ todoId: todo.id, range, part: { index: i + 1, of: ranges.length } }));
  return { blocks, free: nextFree.filter((r) => r.durationMinutes >= g), remainingMinutes: remaining };
}

function roundUp(minutes: number, granularity: number): number {
  return Math.ceil(minutes / granularity) * granularity;
}

function snapUp(date: Date, granularityMinutes: number): Date {
  const step = granularityMinutes * MINUTE_MS;
  return new Date(Math.ceil(date.getTime() / step) * step);
}

function validatePolicy(p: SchedulingPolicy): void {
  if (p.granularityMinutes <= 0 || p.maxBlockMinutes < p.granularityMinutes || p.horizonDays <= 0 || p.breakMinutes < 0) {
    throw new Error(`Invalid scheduling policy: ${JSON.stringify(p)}`);
  }
}
