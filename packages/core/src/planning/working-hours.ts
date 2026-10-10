import { LocalDate, LocalTime, type Weekday } from "../shared/local-date.js";
import { TimeRange } from "../shared/time-range.js";
import { DomainError } from "../shared/result.js";

export interface DayWindow {
  readonly start: LocalTime;
  readonly end: LocalTime;
}

/**
 * The hours in which the executive is willing to be scheduled, per weekday.
 * A missing weekday means "never schedule me on that day".
 */
export class WorkingHours {
  private constructor(private readonly days: ReadonlyMap<Weekday, DayWindow>) {}

  static of(days: Partial<Record<Weekday, DayWindow>>): WorkingHours {
    const map = new Map<Weekday, DayWindow>();
    for (const [k, w] of Object.entries(days) as [string, DayWindow | undefined][]) {
      if (!w) continue;
      if (w.end.compare(w.start) <= 0) {
        throw new DomainError("invalid-working-hours", `Working hours must end after they start (${w.start}–${w.end})`);
      }
      map.set(Number(k) as Weekday, w);
    }
    if (map.size === 0) throw new DomainError("invalid-working-hours", "At least one working day is required");
    return new WorkingHours(map);
  }

  /** Monday–Friday, 09:00–17:00. */
  static default(): WorkingHours {
    return WorkingHours.weekdays(LocalTime.of(9), LocalTime.of(17));
  }

  static weekdays(start: LocalTime, end: LocalTime): WorkingHours {
    const w = { start, end };
    return WorkingHours.of({ 1: w, 2: w, 3: w, 4: w, 5: w });
  }

  windowFor(date: LocalDate): DayWindow | undefined {
    return this.days.get(date.weekday());
  }

  isWorkingDay(date: LocalDate): boolean {
    return this.days.has(date.weekday());
  }

  /** End of the working day on `date`; falls back to 17:00 on a non-working day. */
  endOfDay(date: LocalDate): Date {
    return date.at(this.windowFor(date)?.end ?? LocalTime.of(17));
  }

  /**
   * Working windows that intersect [from, to), clipped to that interval, in chronological order.
   */
  windowsBetween(from: Date, to: Date): TimeRange[] {
    const result: TimeRange[] = [];
    let day = LocalDate.fromDate(from);
    const last = LocalDate.fromDate(to);
    while (day.compare(last) <= 0) {
      const w = this.windowFor(day);
      if (w) {
        const start = new Date(Math.max(day.at(w.start).getTime(), from.getTime()));
        const end = new Date(Math.min(day.at(w.end).getTime(), to.getTime()));
        if (end > start) result.push(TimeRange.of(start, end));
      }
      day = day.addDays(1);
    }
    return result;
  }

  toJSON(): Record<string, { start: string; end: string }> {
    const out: Record<string, { start: string; end: string }> = {};
    for (const [k, w] of this.days) out[String(k)] = { start: w.start.toString(), end: w.end.toString() };
    return out;
  }

  static fromJSON(json: Record<string, { start: string; end: string }>): WorkingHours {
    const days: Partial<Record<Weekday, DayWindow>> = {};
    for (const [k, w] of Object.entries(json)) {
      days[Number(k) as Weekday] = { start: LocalTime.parse(w.start), end: LocalTime.parse(w.end) };
    }
    return WorkingHours.of(days);
  }
}
