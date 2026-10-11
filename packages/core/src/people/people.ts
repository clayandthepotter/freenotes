import type { CalendarEvent } from "../calendar/calendar.js";

/**
 * Relationship signals derived from the calendar: who the executive actually meets, how often,
 * and who is slipping. Only small meetings count (a town hall says nothing about a relationship).
 * Nothing is stored; this is a pure read over the events in view.
 */
export interface Person {
  readonly name: string;
  readonly meetings: number;
  readonly lastSeen?: Date;
  readonly nextSeen?: Date;
  /** Typical days between meetings, when there have been enough to tell. */
  readonly cadenceDays?: number;
  readonly status: "fresh" | "cold";
}

export interface DerivePeopleOptions {
  /** Meetings with more attendees than this are ignored. */
  readonly maxAttendees?: number;
  /** Attendee names (or addresses) to leave out, typically the executive's own. */
  readonly self?: readonly string[];
  /** A person counts as cold after this many days without a meeting and none ahead, unless their cadence says longer. */
  readonly coldAfterDays?: number;
}

export function derivePeople(events: readonly CalendarEvent[], now: Date, options: DerivePeopleOptions = {}): Person[] {
  const maxAttendees = options.maxAttendees ?? 6;
  const self = new Set((options.self ?? []).map(norm));
  const coldAfter = options.coldAfterDays ?? 21;
  const byName = new Map<string, { name: string; past: Date[]; future: Date[] }>();
  for (const e of events) {
    if (e.status === "cancelled" || e.allDay) continue;
    const others = e.attendees.filter((a) => !self.has(norm(a)));
    if (others.length === 0 || others.length > maxAttendees) continue;
    for (const a of others) {
      const key = norm(a);
      const entry = byName.get(key) ?? { name: display(a), past: [], future: [] };
      (e.range.start.getTime() <= now.getTime() ? entry.past : entry.future).push(e.range.start);
      byName.set(key, entry);
    }
  }
  const people: Person[] = [];
  for (const entry of byName.values()) {
    const past = [...entry.past].sort((a, b) => a.getTime() - b.getTime());
    const future = [...entry.future].sort((a, b) => a.getTime() - b.getTime());
    const lastSeen = past[past.length - 1];
    const nextSeen = future[0];
    const cadenceDays = past.length >= 3 ? median(past.slice(1).map((d, i) => (d.getTime() - past[i]!.getTime()) / 86_400_000)) : undefined;
    const threshold = cadenceDays ? Math.max(coldAfter, cadenceDays * 1.5) : coldAfter;
    const silentDays = lastSeen ? (now.getTime() - lastSeen.getTime()) / 86_400_000 : Infinity;
    const cold = !nextSeen && past.length > 0 && silentDays > threshold;
    people.push({
      name: entry.name,
      meetings: past.length + future.length,
      ...(lastSeen ? { lastSeen } : {}),
      ...(nextSeen ? { nextSeen } : {}),
      ...(cadenceDays ? { cadenceDays: Math.round(cadenceDays) } : {}),
      status: cold ? "cold" : "fresh",
    });
  }
  return people.sort((a, b) => Number(b.status === "cold") - Number(a.status === "cold") || b.meetings - a.meetings || a.name.localeCompare(b.name));
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** "priya.patel@x.com" reads as "Priya Patel"; display names pass through. */
function display(s: string): string {
  const t = s.trim();
  if (!t.includes("@")) return t;
  const local = t.split("@")[0] ?? t;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
