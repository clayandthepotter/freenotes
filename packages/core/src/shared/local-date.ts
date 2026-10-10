import { DomainError } from "./result.js";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // Sunday = 0 … Saturday = 6

export const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HH_MM = /^(\d{1,2}):(\d{2})$/;

/**
 * A calendar date without a time zone, e.g. "2026-10-12".
 * Interpreted in the local time zone of the running process/browser when converted to an instant.
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    readonly month: number, // 1-12
    readonly day: number, // 1-31
  ) {}

  static of(year: number, month: number, day: number): LocalDate {
    const probe = new Date(year, month - 1, day);
    if (
      probe.getFullYear() !== year ||
      probe.getMonth() !== month - 1 ||
      probe.getDate() !== day
    ) {
      throw new DomainError("invalid-date", `Invalid calendar date ${year}-${month}-${day}`);
    }
    return new LocalDate(year, month, day);
  }

  static parse(iso: string): LocalDate {
    const m = ISO_DATE.exec(iso.trim());
    if (!m) throw new DomainError("invalid-date", `Expected YYYY-MM-DD, got "${iso}"`);
    return LocalDate.of(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  static fromDate(date: Date): LocalDate {
    return new LocalDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }

  /** Midnight at the start of this date, local time. */
  startOfDay(): Date {
    return new Date(this.year, this.month - 1, this.day, 0, 0, 0, 0);
  }

  /** The instant at the given local time on this date. */
  at(time: LocalTime): Date {
    return new Date(this.year, this.month - 1, this.day, time.hour, time.minute, 0, 0);
  }

  addDays(days: number): LocalDate {
    return LocalDate.fromDate(new Date(this.year, this.month - 1, this.day + days));
  }

  weekday(): Weekday {
    return this.startOfDay().getDay() as Weekday;
  }

  /** Next occurrence of `weekday` strictly after this date (1..7 days ahead). */
  nextWeekday(weekday: Weekday): LocalDate {
    const delta = ((weekday - this.weekday() + 7) % 7) || 7;
    return this.addDays(delta);
  }

  endOfMonth(): LocalDate {
    return LocalDate.fromDate(new Date(this.year, this.month, 0));
  }

  compare(other: LocalDate): number {
    return this.toString().localeCompare(other.toString());
  }

  isBefore(other: LocalDate): boolean {
    return this.compare(other) < 0;
  }

  equals(other: LocalDate): boolean {
    return this.compare(other) === 0;
  }

  toString(): string {
    return `${this.year}-${pad(this.month)}-${pad(this.day)}`;
  }

  toJSON(): string {
    return this.toString();
  }
}

/** A wall-clock time of day, e.g. "09:30". */
export class LocalTime {
  private constructor(
    readonly hour: number,
    readonly minute: number,
  ) {}

  static of(hour: number, minute = 0): LocalTime {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      throw new DomainError("invalid-time", `Invalid time ${hour}:${minute}`);
    }
    return new LocalTime(hour, minute);
  }

  static parse(text: string): LocalTime {
    const m = HH_MM.exec(text.trim());
    if (!m) throw new DomainError("invalid-time", `Expected HH:MM, got "${text}"`);
    return LocalTime.of(Number(m[1]), Number(m[2]));
  }

  static fromDate(date: Date): LocalTime {
    return new LocalTime(date.getHours(), date.getMinutes());
  }

  get minutesOfDay(): number {
    return this.hour * 60 + this.minute;
  }

  compare(other: LocalTime): number {
    return this.minutesOfDay - other.minutesOfDay;
  }

  toString(): string {
    return `${pad(this.hour)}:${pad(this.minute)}`;
  }

  toJSON(): string {
    return this.toString();
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
