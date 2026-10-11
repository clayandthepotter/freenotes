import { TimeRange } from "../shared/time-range.js";

/**
 * Calendars the executive connected and the events pulled from them. freenotes never owns these
 * events: they are read for the brief and treated as busy time by the scheduler. Sources start
 * with ICS feeds (the private address every Google, Outlook and iCloud calendar publishes);
 * OAuth-backed sources plug into the same shape later.
 */
export type CalendarSource = { readonly kind: "ics"; readonly url: string };

export interface ConnectedCalendar {
  readonly id: string;
  readonly label: string;
  readonly color: string; // CSS colour, chosen by the user or assigned from the palette
  readonly source: CalendarSource;
  readonly lastSyncedAt?: Date;
  readonly lastError?: string;
}

export interface CalendarEvent {
  readonly calendarId: string;
  readonly uid: string;
  readonly title: string;
  readonly range: TimeRange;
  readonly allDay: boolean;
  readonly location?: string;
  readonly attendees: readonly string[]; // display names or addresses, as the feed gives them
  readonly status: "confirmed" | "tentative" | "cancelled";
  /** True when the event does not block time (TRANSP:TRANSPARENT, e.g. birthdays). */
  readonly transparent: boolean;
}

export interface CalendarState {
  readonly calendars: readonly ConnectedCalendar[];
  readonly events: readonly CalendarEvent[];
  /** The window the cached events cover; events outside it are unknown, not absent. */
  readonly window?: TimeRange;
}

export const CALENDAR_PALETTE = ["#6c5ce7", "#00a884", "#e17055", "#0984e3", "#d63384", "#f39c12", "#6b7280"] as const;

export function emptyCalendarState(): CalendarState {
  return { calendars: [], events: [] };
}

/** Turns a user-pasted address into one we can fetch: webcal:// becomes https://, whitespace is dropped. */
export function normaliseFeedUrl(input: string): string {
  const trimmed = input.trim().replace(/^webcals?:\/\//i, "https://");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new CalendarError("invalid-url", "That does not look like a calendar address. Paste the private ICS link from your calendar's settings.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new CalendarError("invalid-url", "Calendar addresses must start with https:// or webcal://.");
  return url.toString();
}

export class CalendarError extends Error {
  constructor(
    readonly code: "invalid-url" | "duplicate" | "unknown-calendar",
    message: string,
  ) {
    super(message);
    this.name = "CalendarError";
  }
}

/** Busy time inside `window`: timed, non-transparent, non-cancelled events, merged where they overlap. */
export function busyRanges(events: readonly CalendarEvent[], window: TimeRange): TimeRange[] {
  const clipped = events
    .filter((e) => !e.allDay && !e.transparent && e.status !== "cancelled" && e.range.overlaps(window))
    .map((e) => TimeRange.of(new Date(Math.max(e.range.start.getTime(), window.start.getTime())), new Date(Math.min(e.range.end.getTime(), window.end.getTime()))))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: TimeRange[] = [];
  for (const r of clipped) {
    const last = merged[merged.length - 1];
    if (last && r.start.getTime() <= last.end.getTime()) {
      if (r.end.getTime() > last.end.getTime()) merged[merged.length - 1] = TimeRange.of(last.start, r.end);
    } else merged.push(r);
  }
  return merged;
}

/** Events that touch the given day, earliest first; all-day events lead. */
export function eventsOn(events: readonly CalendarEvent[], day: TimeRange): CalendarEvent[] {
  return events
    .filter((e) => e.status !== "cancelled" && e.range.overlaps(day))
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.range.start.getTime() - b.range.start.getTime());
}
