import { describe, expect, it } from "vitest";
import { TimeRange } from "../shared/time-range.js";
import { busyRanges, eventsOn, normaliseFeedUrl } from "./calendar.js";
import { parseIcs } from "./ics.js";

const window = TimeRange.of(new Date("2026-10-12T00:00:00Z"), new Date("2026-10-26T00:00:00Z"));
const opts = { calendarId: "cal1", window };

const GOOGLE_LIKE = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
BEGIN:VTIMEZONE
TZID:America/New_York
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20261005T100000
DTEND;TZID=America/New_York:20261005T103000
RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T045959Z
EXDATE;TZID=America/New_York:20261019T100000
UID:standup@example.com
SUMMARY:Team standup
LOCATION:Zoom
ATTENDEE;CN=Priya Patel;ROLE=REQ-PARTICIPANT:mailto:priya@example.com
ATTENDEE:mailto:sam@example.com
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20261014T140000
DTEND;TZID=America/New_York:20261014T150000
RECURRENCE-ID;TZID=America/New_York:20261014T100000
UID:standup@example.com
SUMMARY:Team standup (moved)
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261015
DTEND;VALUE=DATE:20261016
UID:birthday@example.com
SUMMARY:Ada's birthday
TRANSP:TRANSPARENT
END:VEVENT
BEGIN:VEVENT
DTSTART:20261013T120000Z
DURATION:PT45M
UID:lunch@example.com
SUMMARY:Lunch with\\, Sam\\nat the usual place
STATUS:CANCELLED
END:VEVENT
BEGIN:VEVENT
DTSTART:20261020T090000Z
DTEND:20261020T100000Z
UID:review@example.com
SUMMARY:Quarterly review
BEGIN:VALARM
TRIGGER:-PT10M
DESCRIPTION:Reminder
END:VALARM
END:VEVENT
END:VCALENDAR
`;

describe("parseIcs", () => {
  const events = parseIcs(GOOGLE_LIKE, opts);
  const standups = events.filter((e) => e.uid === "standup@example.com");

  it("expands a weekly BYDAY rule inside the window, honouring EXDATE and overrides", () => {
    const starts = standups.map((e) => e.range.start.toISOString());
    // Mondays and Wednesdays in the window, 10:00 New York = 14:00Z; Mon 19 Oct excluded; Wed 14 Oct replaced by the override at 14:00 NY.
    expect(starts).toEqual(["2026-10-12T14:00:00.000Z", "2026-10-14T18:00:00.000Z", "2026-10-21T14:00:00.000Z"]);
    expect(standups.find((e) => e.range.start.toISOString() === "2026-10-14T18:00:00.000Z")?.title).toBe("Team standup (moved)");
  });

  it("keeps attendees, location and status", () => {
    const first = standups[0]!;
    expect(first.attendees).toEqual(["Priya Patel", "sam@example.com"]);
    expect(first.location).toBe("Zoom");
    expect(first.status).toBe("confirmed");
    expect(first.range.durationMinutes).toBe(30);
  });

  it("reads all-day, cancelled and transparent events, and unescapes text", () => {
    const birthday = events.find((e) => e.uid === "birthday@example.com")!;
    expect(birthday.allDay).toBe(true);
    expect(birthday.transparent).toBe(true);
    expect(birthday.range.durationMinutes).toBe(24 * 60);
    const lunch = events.find((e) => e.uid === "lunch@example.com")!;
    expect(lunch.status).toBe("cancelled");
    expect(lunch.title).toBe("Lunch with, Sam\nat the usual place");
    expect(lunch.range.durationMinutes).toBe(45);
  });

  it("ignores nested components like VALARM and keeps the event", () => {
    const review = events.find((e) => e.uid === "review@example.com")!;
    expect(review.range.start.toISOString()).toBe("2026-10-20T09:00:00.000Z");
    expect(review.range.durationMinutes).toBe(60);
  });

  it("supports folded lines, COUNT, Windows time-zone names and floating times", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:a",
      "DTSTART;TZID=Eastern Standard Time:20261013T090000",
      "DTEND;TZID=Eastern Standard Time:20261013T093000",
      "RRULE:FREQ=DAILY;COUNT=3",
      "SUMMARY:A very long summary that the",
      "  feed folded onto two lines",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:b",
      "DTSTART:20261014T080000",
      "DTEND:20261014T090000",
      "SUMMARY:Floating",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const out = parseIcs(ics, opts);
    const a = out.filter((e) => e.uid === "a");
    expect(a.map((e) => e.range.start.toISOString())).toEqual(["2026-10-13T13:00:00.000Z", "2026-10-14T13:00:00.000Z", "2026-10-15T13:00:00.000Z"]);
    expect(a[0]!.title).toBe("A very long summary that the feed folded onto two lines");
    const b = out.find((e) => e.uid === "b")!;
    expect(b.range.start.getTime()).toBe(new Date(2026, 9, 14, 8, 0).getTime()); // floating = local time (UTC in tests)
  });

  it("never loops forever on an open-ended rule", () => {
    const ics = "BEGIN:VEVENT\nUID:x\nDTSTART:20200101T090000Z\nDTEND:20200101T100000Z\nRRULE:FREQ=DAILY\nSUMMARY:Forever\nEND:VEVENT";
    const out = parseIcs(ics, opts);
    expect(out.length).toBe(14); // one per day inside the two-week window, however old the rule is
    const weekly = "BEGIN:VEVENT\nUID:y\nDTSTART:20190102T090000Z\nDTEND:20190102T100000Z\nRRULE:FREQ=WEEKLY;BYDAY=WE;INTERVAL=2\nSUMMARY:Fortnightly\nEND:VEVENT";
    const w = parseIcs(weekly, opts).map((e) => e.range.start.toISOString());
    expect(w).toEqual(["2026-10-14T09:00:00.000Z"]); // every other Wednesday since 2019 lands on 14 Oct, not 21 Oct
  });

  it("drops events without UID or DTSTART", () => {
    expect(parseIcs("BEGIN:VEVENT\nSUMMARY:no uid\nDTSTART:20261013T120000Z\nEND:VEVENT", opts)).toEqual([]);
  });
});

describe("busyRanges and eventsOn", () => {
  const events = parseIcs(GOOGLE_LIKE, opts);
  it("merges overlapping timed events and ignores all-day, transparent and cancelled ones", () => {
    const day = TimeRange.of(new Date("2026-10-14T00:00:00Z"), new Date("2026-10-15T00:00:00Z"));
    const busy = busyRanges([...events, { ...events[0]!, uid: "overlap", range: TimeRange.of(new Date("2026-10-14T18:15:00Z"), new Date("2026-10-14T19:30:00Z")) }], day);
    expect(busy.map((r) => [r.start.toISOString(), r.end.toISOString()])).toEqual([["2026-10-14T18:00:00.000Z", "2026-10-14T19:30:00.000Z"]]);
    const birthday = TimeRange.of(new Date("2026-10-15T00:00:00Z"), new Date("2026-10-16T00:00:00Z"));
    expect(busyRanges(events, birthday)).toEqual([]);
    expect(eventsOn(events, birthday).map((e) => e.uid)).toEqual(["birthday@example.com"]);
  });
});

describe("normaliseFeedUrl", () => {
  it("accepts https and webcal, rejects the rest", () => {
    expect(normaliseFeedUrl(" webcal://calendar.google.com/calendar/ical/x/private-abc/basic.ics ")).toBe("https://calendar.google.com/calendar/ical/x/private-abc/basic.ics");
    expect(() => normaliseFeedUrl("ftp://x")).toThrow(/https/);
    expect(() => normaliseFeedUrl("not a url")).toThrow(/calendar address/);
  });
});
