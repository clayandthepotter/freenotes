import { LocalDate, LocalTime, WEEKDAY_NAMES, type Weekday } from "../shared/local-date.js";
import type { Deadline } from "./todo.js";

const WEEKDAY_ALIASES: Record<string, Weekday> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const TIME_RE = /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b|\b(noon|midday|midnight|eod|cob)\b/gi;

/**
 * Parses a human deadline expression ("Friday", "tomorrow 3pm", "Oct 20", "2026-10-20 17:00", "eod",
 * "next week", "end of month") relative to `today`. Returns undefined when nothing date-like is found.
 *
 * Deliberately deterministic: the assistant may refine todos later, but the user's words
 * are interpreted the same way every time.
 */
export function parseDateExpression(input: string, today: LocalDate): Deadline | undefined {
  let text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return undefined;

  let time: LocalTime | undefined;
  for (const timeMatch of text.matchAll(TIME_RE)) {
    const parsed = parseTime(timeMatch);
    if (parsed) {
      time = parsed;
      text = (text.slice(0, timeMatch.index) + " " + text.slice(timeMatch.index + timeMatch[0].length))
        .replace(/\s+/g, " ")
        .trim();
      break;
    }
  }

  const date = parseDatePart(text, today);
  if (!date) {
    // A bare time such as "by 3pm" means today.
    if (time && text === "") return { date: today, time };
    return undefined;
  }
  return time ? { date, time } : { date };
}

function parseTime(m: RegExpMatchArray): LocalTime | undefined {
  const keyword = m[4];
  if (keyword) {
    switch (keyword) {
      case "noon":
      case "midday":
        return LocalTime.of(12, 0);
      case "midnight":
        return LocalTime.of(23, 59);
      case "eod":
      case "cob":
        return undefined; // end of (working) day → leave time undefined, the scheduler resolves it
    }
  }
  const hourRaw = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3];
  // A bare number without am/pm or minutes is ambiguous ("Oct 20"); only accept it with a colon or meridiem.
  if (!meridiem && !m[2]) return undefined;
  let hour = hourRaw;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return undefined;
  return LocalTime.of(hour, minute);
}

function parseDatePart(text: string, today: LocalDate): LocalDate | undefined {
  text = text.replace(/^(on|the|this|by|due|before)\s+/g, "").replace(/\s+(eod|cob)$/g, "").trim();
  if (text === "" || text === "eod" || text === "cob" || text === "today" || text === "tonight") return today;
  if (text === "tomorrow" || text === "tmr" || text === "tmrw") return today.addDays(1);
  if (text === "day after tomorrow") return today.addDays(2);
  if (/^(end of (the )?week|eow)$/.test(text)) return endOfWeek(today);
  if (/^(end of (the )?month|eom)$/.test(text)) return today.endOfMonth();
  if (/^next week$/.test(text)) return today.nextWeekday(1);
  if (/^next month$/.test(text)) return today.endOfMonth().addDays(1);

  const inMatch = /^in (\d+) (day|days|week|weeks)$/.exec(text);
  if (inMatch) {
    const n = Number(inMatch[1]);
    return today.addDays(inMatch[2]!.startsWith("week") ? n * 7 : n);
  }

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return safeDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(text);
  if (slash) {
    const year = slash[3] ? normalizeYear(Number(slash[3])) : undefined;
    return resolveMonthDay(Number(slash[1]), Number(slash[2]), year, today);
  }

  const weekday = /^(next )?([a-z]+)$/.exec(text);
  if (weekday && weekday[2]! in WEEKDAY_ALIASES) {
    const target = WEEKDAY_ALIASES[weekday[2]!]!;
    const next = today.nextWeekday(target);
    return weekday[1] ? next.addDays(next.addDays(-7).compare(today) > 0 ? 0 : 7) : next;
  }

  const monthDay =
    /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(text) ??
    swap(/^(\d{1,2})(?:st|nd|rd|th)? ([a-z]+)\.?(?:,? (\d{4}))?$/.exec(text));
  if (monthDay && monthDay[1]! in MONTHS) {
    const year = monthDay[3] ? Number(monthDay[3]) : undefined;
    return resolveMonthDay(MONTHS[monthDay[1]!]!, Number(monthDay[2]), year, today);
  }

  return undefined;
}

function swap(m: RegExpExecArray | null): RegExpExecArray | null {
  if (!m) return null;
  const copy = [...m] as unknown as RegExpExecArray;
  copy[1] = m[2]!;
  copy[2] = m[1]!;
  return copy;
}

function endOfWeek(today: LocalDate): LocalDate {
  // "End of week" means this Friday, or next Friday when it is already the weekend.
  const friday = 5;
  return today.weekday() === friday ? today : today.nextWeekday(friday);
}

function normalizeYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

function resolveMonthDay(month: number, day: number, year: number | undefined, today: LocalDate): LocalDate | undefined {
  if (year !== undefined) return safeDate(year, month, day);
  const thisYear = safeDate(today.year, month, day);
  if (!thisYear) return undefined;
  // A month/day without a year refers to the next occurrence (today counts).
  return thisYear.isBefore(today) ? safeDate(today.year + 1, month, day) : thisYear;
}

function safeDate(year: number, month: number, day: number): LocalDate | undefined {
  try {
    return LocalDate.of(year, month, day);
  } catch {
    return undefined;
  }
}

export { WEEKDAY_NAMES };
