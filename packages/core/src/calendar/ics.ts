import { TimeRange } from "../shared/time-range.js";
import type { CalendarEvent } from "./calendar.js";

/**
 * A small, dependency-free iCalendar reader: enough for what Google, Outlook and iCloud publish.
 * Handles folded lines, DATE and DATE-TIME values (UTC, floating, TZID), DURATION, RRULE with
 * FREQ/INTERVAL/COUNT/UNTIL/BYDAY, EXDATE, RECURRENCE-ID overrides, STATUS and TRANSP.
 * Everything it does not understand is ignored rather than guessed.
 */
export interface ParseIcsOptions {
  readonly calendarId: string;
  /** Only occurrences overlapping this window are produced; recurrences are expanded inside it. */
  readonly window: TimeRange;
}

interface Property {
  readonly name: string;
  readonly params: Readonly<Record<string, string>>;
  readonly value: string;
}

interface Wall {
  readonly y: number;
  readonly mo: number; // 1-12
  readonly d: number;
  readonly h: number;
  readonly mi: number;
  readonly s: number;
  readonly dateOnly: boolean;
  readonly zone: { kind: "utc" } | { kind: "floating" } | { kind: "zoned"; tz: string };
}

export function parseIcs(text: string, options: ParseIcsOptions): CalendarEvent[] {
  const lines = unfold(text);
  const blocks = veventBlocks(lines);
  const overrides = new Map<string, Set<number>>(); // uid → recurrence-id instants
  const parsed = blocks.map((b) => readEvent(b)).filter((e): e is RawEvent => e !== undefined);
  for (const e of parsed) {
    if (e.recurrenceId !== undefined) {
      const set = overrides.get(e.uid) ?? new Set<number>();
      set.add(e.recurrenceId);
      overrides.set(e.uid, set);
    }
  }
  const out: CalendarEvent[] = [];
  const seen = new Set<string>();
  for (const e of parsed) {
    for (const range of occurrences(e, options.window, overrides.get(e.uid))) {
      const key = `${e.uid}|${range.start.getTime()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        calendarId: options.calendarId,
        uid: e.uid,
        title: e.title,
        range,
        allDay: e.start.dateOnly,
        ...(e.location ? { location: e.location } : {}),
        attendees: e.attendees,
        status: e.status,
        transparent: e.transparent,
      });
    }
  }
  return out.sort((a, b) => a.range.start.getTime() - b.range.start.getTime() || a.title.localeCompare(b.title));
}

// --- lexical -----------------------------------------------------------------------------------

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out.filter((l) => l.length > 0);
}

function veventBlocks(lines: readonly string[]): Property[][] {
  const blocks: Property[][] = [];
  let current: Property[] | undefined;
  let depth = 0;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = [];
      depth = 0;
      continue;
    }
    if (line === "END:VEVENT") {
      if (current) blocks.push(current);
      current = undefined;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("BEGIN:")) depth += 1; // VALARM etc. inside the event
    else if (line.startsWith("END:")) depth -= 1;
    else if (depth === 0) {
      const p = property(line);
      if (p) current.push(p);
    }
  }
  return blocks;
}

function property(line: string): Property | undefined {
  // NAME;PARAM=VALUE;PARAM="quoted:value":VALUE
  let i = 0;
  let quoted = false;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) break;
  }
  if (i >= line.length) return undefined;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const [name = "", ...paramParts] = splitUnquoted(head, ";");
  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

function splitUnquoted(s: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (ch === sep && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function unescapeText(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

// --- events ------------------------------------------------------------------------------------

interface RawEvent {
  readonly uid: string;
  readonly title: string;
  readonly start: Wall;
  readonly durationMs: number;
  readonly location?: string;
  readonly attendees: readonly string[];
  readonly status: CalendarEvent["status"];
  readonly transparent: boolean;
  readonly rrule?: Readonly<Record<string, string>>;
  readonly exdates: ReadonlySet<number>;
  readonly recurrenceId?: number;
}

function readEvent(props: readonly Property[]): RawEvent | undefined {
  const get = (name: string) => props.find((p) => p.name === name);
  const uid = get("UID")?.value.trim();
  const dtstart = get("DTSTART");
  if (!uid || !dtstart) return undefined;
  const start = wall(dtstart);
  if (!start) return undefined;
  const dtend = get("DTEND");
  const duration = get("DURATION");
  let durationMs: number;
  if (dtend) {
    const end = wall(dtend);
    durationMs = end ? toInstant(end).getTime() - toInstant(start).getTime() : 0;
  } else if (duration) durationMs = parseDuration(duration.value);
  else durationMs = start.dateOnly ? 86_400_000 : 0;
  if (durationMs <= 0) durationMs = start.dateOnly ? 86_400_000 : 0;

  const statusRaw = get("STATUS")?.value.trim().toUpperCase();
  const status: CalendarEvent["status"] = statusRaw === "CANCELLED" ? "cancelled" : statusRaw === "TENTATIVE" ? "tentative" : "confirmed";
  const attendees = props
    .filter((p) => p.name === "ATTENDEE")
    .map((p) => p.params["CN"] ?? p.value.replace(/^mailto:/i, ""))
    .filter(Boolean);
  const exdates = new Set<number>();
  for (const p of props.filter((x) => x.name === "EXDATE")) {
    for (const v of p.value.split(",")) {
      const w = wall({ ...p, value: v.trim() });
      if (w) exdates.add(toInstant(w).getTime());
    }
  }
  const rid = get("RECURRENCE-ID");
  const ridWall = rid ? wall(rid) : undefined;
  const rrule = get("RRULE");
  const location = unescapeText(get("LOCATION")?.value ?? "");
  return {
    uid,
    title: unescapeText(get("SUMMARY")?.value ?? "") || "(untitled)",
    start,
    durationMs,
    ...(location ? { location } : {}),
    attendees,
    status,
    transparent: (get("TRANSP")?.value.trim().toUpperCase() ?? "OPAQUE") === "TRANSPARENT",
    ...(rrule ? { rrule: parseRrule(rrule.value) } : {}),
    exdates,
    ...(ridWall ? { recurrenceId: toInstant(ridWall).getTime() } : {}),
  };
}

function parseRrule(v: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of v.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) out[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).toUpperCase();
  }
  return out;
}

function parseDuration(v: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(v.trim());
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const [w, d, h, mi, s] = [m[2], m[3], m[4], m[5], m[6]].map((x) => Number(x ?? 0));
  return sign * ((((w! * 7 + d!) * 24 + h!) * 60 + mi!) * 60 + s!) * 1000;
}

// --- time --------------------------------------------------------------------------------------

const WINDOWS_TZ: Record<string, string> = {
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "Tokyo Standard Time": "Asia/Tokyo",
  "India Standard Time": "Asia/Kolkata",
  "Singapore Standard Time": "Asia/Singapore",
  UTC: "UTC",
};

function wall(p: Property): Wall | undefined {
  const v = p.value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return undefined;
  const dateOnly = m[4] === undefined || p.params["VALUE"] === "DATE";
  const base = { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]), h: Number(m[4] ?? 0), mi: Number(m[5] ?? 0), s: Number(m[6] ?? 0), dateOnly };
  if (dateOnly) return { ...base, zone: { kind: "floating" } };
  if (m[7] === "Z") return { ...base, zone: { kind: "utc" } };
  const tzid = p.params["TZID"];
  if (tzid) {
    const tz = resolveTz(tzid);
    if (tz) return { ...base, zone: { kind: "zoned", tz } };
  }
  return { ...base, zone: { kind: "floating" } };
}

function resolveTz(tzid: string): string | undefined {
  const candidate = WINDOWS_TZ[tzid] ?? tzid.replace(/^\/?(?:[^/]+\/)?(?=[A-Z][A-Za-z_]+\/)/, "");
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return undefined;
  }
}

function toInstant(w: Wall): Date {
  if (w.zone.kind === "utc") return new Date(Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s));
  if (w.zone.kind === "floating") return new Date(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  return zonedToUtc(w, w.zone.tz);
}

/** The instant at which the wall clock in `tz` reads `w`. Two fixed-point passes cover DST edges. */
function zonedToUtc(w: Wall, tz: string): Date {
  let guess = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
  for (let i = 0; i < 2; i++) {
    const seen = wallInZone(new Date(guess), tz);
    const diff = Date.UTC(seen.y, seen.mo - 1, seen.d, seen.h, seen.mi, seen.s) - Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s);
    if (diff === 0) break;
    guess -= diff;
  }
  return new Date(guess);
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function wallInZone(instant: Date, tz: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    fmtCache.set(tz, fmt);
  }
  const parts: Record<string, number> = {};
  for (const p of fmt.formatToParts(instant)) if (p.type !== "literal") parts[p.type] = Number(p.value);
  return { y: parts["year"]!, mo: parts["month"]!, d: parts["day"]!, h: parts["hour"]! % 24, mi: parts["minute"]!, s: parts["second"]! };
}

/** Wall-clock arithmetic: shift a wall date by days/months/years, keeping the time of day. */
function shift(w: Wall, by: { days?: number; months?: number; years?: number }): Wall {
  const t = new Date(Date.UTC(w.y + (by.years ?? 0), w.mo - 1 + (by.months ?? 0), w.d + (by.days ?? 0), w.h, w.mi, w.s));
  return { ...w, y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function weekdayOf(w: Wall): number {
  return new Date(Date.UTC(w.y, w.mo - 1, w.d)).getUTCDay();
}

// --- recurrence --------------------------------------------------------------------------------

const DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const MAX_OCCURRENCES = 2000;

function* occurrences(e: RawEvent, window: TimeRange, overridden: ReadonlySet<number> | undefined): Generator<TimeRange> {
  const emit = function* (startWall: Wall): Generator<TimeRange> {
    const start = toInstant(startWall);
    const key = start.getTime();
    if (e.exdates.has(key)) return;
    if (e.recurrenceId === undefined && overridden?.has(key)) return; // an override replaces this occurrence
    const end = new Date(key + Math.max(e.durationMs, 1));
    const range = TimeRange.of(start, end);
    if (range.overlaps(window)) yield range;
  };

  if (!e.rrule) {
    yield* emit(e.start);
    return;
  }
  const freq = e.rrule["FREQ"];
  const interval = Math.max(1, Number(e.rrule["INTERVAL"] ?? 1) || 1);
  const count = e.rrule["COUNT"] ? Number(e.rrule["COUNT"]) : undefined;
  const untilRaw = e.rrule["UNTIL"];
  const until = untilRaw ? wall({ name: "UNTIL", params: untilRaw.endsWith("Z") || untilRaw.length === 8 ? {} : e.start.zone.kind === "zoned" ? { TZID: e.start.zone.tz } : {}, value: untilRaw }) : undefined;
  const untilMs = until ? toInstant(until.dateOnly ? { ...until, h: 23, mi: 59, s: 59 } : until).getTime() : undefined;
  const stopAt = window.end.getTime();

  let produced = 0;
  let iterations = 0;
  // Unbounded daily/weekly rules can predate the window by years: jump to just before it instead of walking.
  const DAY_MS = 86_400_000;
  const daysBeforeWindow = Math.floor((window.start.getTime() - toInstant(e.start).getTime()) / DAY_MS);
  const byDay = freq === "WEEKLY" && e.rrule["BYDAY"] ? e.rrule["BYDAY"].split(",").map((c) => DAY_CODES.indexOf(c.slice(-2))).filter((i) => i >= 0) : undefined;

  if (freq === "WEEKLY" && byDay && byDay.length) {
    // Walk week by week from the week containing DTSTART, emitting the listed weekdays.
    const startDow = weekdayOf(e.start);
    let weekStart = shift(e.start, { days: -startDow });
    if (count === undefined && daysBeforeWindow > 14 * interval) {
      const weeks = Math.floor(daysBeforeWindow / (7 * interval)) - 1;
      weekStart = shift(weekStart, { days: weeks * 7 * interval });
    }
    while (iterations++ < MAX_OCCURRENCES) {
      for (const dow of [...byDay].sort((a, b) => a - b)) {
        const w = shift(weekStart, { days: dow });
        const t = toInstant(w).getTime();
        if (t < toInstant(e.start).getTime()) continue;
        if (untilMs !== undefined && t > untilMs) return;
        if (count !== undefined && produced >= count) return;
        produced += 1;
        if (t >= stopAt) return;
        yield* emit(w);
      }
      weekStart = shift(weekStart, { days: 7 * interval });
    }
    return;
  }

  let current = e.start;
  if (count === undefined && (freq === "DAILY" || freq === "WEEKLY")) {
    const stepDays = interval * (freq === "DAILY" ? 1 : 7);
    const steps = Math.floor(daysBeforeWindow / stepDays) - 1;
    if (steps > 0) current = shift(current, { days: steps * stepDays });
  }
  while (iterations++ < MAX_OCCURRENCES) {
    const t = toInstant(current).getTime();
    if (untilMs !== undefined && t > untilMs) return;
    if (count !== undefined && produced >= count) return;
    produced += 1;
    if (t >= stopAt) return;
    yield* emit(current);
    if (freq === "DAILY") current = shift(current, { days: interval });
    else if (freq === "WEEKLY") current = shift(current, { days: 7 * interval });
    else if (freq === "MONTHLY") current = shift(current, { months: interval });
    else if (freq === "YEARLY") current = shift(current, { years: interval });
    else return; // unsupported FREQ (SECONDLY…): emit the first occurrence only
  }
}
