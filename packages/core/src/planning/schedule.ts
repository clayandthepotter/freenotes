import type { TimeRange } from "../shared/time-range.js";
import type { TodoId } from "./todo.js";

/** Tunable knobs for the scheduler; the defaults suit a knowledge worker's calendar. */
export interface SchedulingPolicy {
  /** Blocks start and end on multiples of this many minutes. */
  readonly granularityMinutes: number;
  /** A single focus block never exceeds this; longer todos are split into parts. */
  readonly maxBlockMinutes: number;
  /** Breathing room inserted after every block. */
  readonly breakMinutes: number;
  /** How far ahead to look for capacity. */
  readonly horizonDays: number;
}

export const DEFAULT_POLICY: SchedulingPolicy = {
  granularityMinutes: 15,
  maxBlockMinutes: 90,
  breakMinutes: 10,
  horizonDays: 14,
};

export interface TimeBlock {
  readonly todoId: TodoId;
  readonly range: TimeRange;
  /** 1-based part index when a todo is split, e.g. part 2 of 3. */
  readonly part: { readonly index: number; readonly of: number };
}

export type ScheduleWarning =
  | {
      readonly kind: "deadline-at-risk";
      readonly todoId: TodoId;
      readonly deadlineAt: Date;
      readonly finishesAt: Date;
    }
  | {
      readonly kind: "deadline-passed";
      readonly todoId: TodoId;
      readonly deadlineAt: Date;
    };

export interface UnscheduledTodo {
  readonly todoId: TodoId;
  readonly remainingMinutes: number;
  readonly reason: "no-capacity-in-horizon";
}

export interface Schedule {
  readonly generatedAt: Date;
  readonly horizon: TimeRange;
  readonly blocks: readonly TimeBlock[];
  readonly unscheduled: readonly UnscheduledTodo[];
  readonly warnings: readonly ScheduleWarning[];
}

export function blocksFor(schedule: Schedule, todoId: TodoId): TimeBlock[] {
  return schedule.blocks.filter((b) => b.todoId === todoId);
}

export function totalScheduledMinutes(schedule: Schedule): number {
  return schedule.blocks.reduce((sum, b) => sum + b.range.durationMinutes, 0);
}
