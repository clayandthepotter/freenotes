import { DomainError } from "./result.js";

export const MINUTE_MS = 60_000;

/** A half-open interval [start, end) of absolute time. */
export class TimeRange {
  private constructor(
    readonly start: Date,
    readonly end: Date,
  ) {}

  static of(start: Date, end: Date): TimeRange {
    if (end.getTime() <= start.getTime()) {
      throw new DomainError(
        "invalid-range",
        `TimeRange end must be after start (${start.toISOString()} → ${end.toISOString()})`,
      );
    }
    return new TimeRange(new Date(start.getTime()), new Date(end.getTime()));
  }

  static ofMinutes(start: Date, minutes: number): TimeRange {
    return TimeRange.of(start, new Date(start.getTime() + minutes * MINUTE_MS));
  }

  get durationMinutes(): number {
    return Math.round((this.end.getTime() - this.start.getTime()) / MINUTE_MS);
  }

  overlaps(other: TimeRange): boolean {
    return this.start < other.end && other.start < this.end;
  }

  contains(instant: Date): boolean {
    return this.start <= instant && instant < this.end;
  }

  /** The parts of this range not covered by `other` (0, 1 or 2 ranges). */
  subtract(other: TimeRange): TimeRange[] {
    if (!this.overlaps(other)) return [this];
    const parts: TimeRange[] = [];
    if (other.start > this.start) parts.push(TimeRange.of(this.start, other.start));
    if (other.end < this.end) parts.push(TimeRange.of(other.end, this.end));
    return parts;
  }

  equals(other: TimeRange): boolean {
    return (
      this.start.getTime() === other.start.getTime() && this.end.getTime() === other.end.getTime()
    );
  }

  toString(): string {
    return `${this.start.toISOString()} → ${this.end.toISOString()}`;
  }
}

/** Removes every `busy` range from the `free` ranges, returning sorted, non-overlapping free ranges. */
export function subtractAll(free: readonly TimeRange[], busy: readonly TimeRange[]): TimeRange[] {
  let remaining = [...free];
  for (const b of busy) {
    remaining = remaining.flatMap((r) => r.subtract(b));
  }
  return remaining.sort((a, b) => a.start.getTime() - b.start.getTime());
}
