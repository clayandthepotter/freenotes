import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "../calendar/calendar.js";
import { TimeRange } from "../shared/time-range.js";
import { derivePeople } from "./people.js";

const now = new Date("2026-10-12T12:00:00Z");
const day = (offset: number, attendees: string[], over: Partial<CalendarEvent> = {}): CalendarEvent => {
  const start = new Date(now.getTime() + offset * 86_400_000);
  return { calendarId: "c", uid: `u${offset}-${attendees.join("")}`, title: "m", range: TimeRange.ofMinutes(start, 30), allDay: false, attendees, status: "confirmed", transparent: false, ...over };
};

describe("derivePeople", () => {
  it("counts small meetings, finds cadence, and flags who is going cold", () => {
    const events = [
      day(-28, ["Priya Patel"]),
      day(-21, ["Priya Patel"]),
      day(-14, ["Priya Patel"]),
      day(-7, ["Priya Patel"]), // weekly, next one missing: 5 days silent is still fine
      day(-45, ["sam.lee@x.com"]),
      day(-40, ["sam.lee@x.com"]),
      day(-35, ["sam.lee@x.com"]), // every five days, then nothing for 35: cold
      day(-3, ["Ada", "me@x.com"]),
      day(2, ["Ada", "me@x.com"]),
      day(-1, Array.from({ length: 12 }, (_, i) => `p${i}`)), // town hall: ignored
      day(-2, ["Ghost"], { status: "cancelled" }),
    ];
    const people = derivePeople(events, now, { self: ["me@x.com"] });
    expect(people.map((p) => [p.name, p.meetings, p.status])).toEqual([
      ["Sam Lee", 3, "cold"],
      ["Priya Patel", 4, "fresh"],
      ["Ada", 2, "fresh"],
    ]);
    expect(people[1]).toMatchObject({ cadenceDays: 7 });
    expect(people[1]!.nextSeen).toBeUndefined();
    expect(people[2]!.nextSeen?.toISOString()).toBe("2026-10-14T12:00:00.000Z");
    expect(people.find((p) => p.name === "Ghost")).toBeUndefined();
  });

  it("is not cold while something is scheduled, and uses the cadence when it is longer than the default", () => {
    const monthly = [day(-95, ["Lee"]), day(-65, ["Lee"]), day(-35, ["Lee"])]; // every 30 days, 35 silent: within 1.5× cadence
    expect(derivePeople(monthly, now)[0]!.status).toBe("fresh");
    const scheduled = [day(-60, ["Kim"]), day(5, ["Kim"])];
    expect(derivePeople(scheduled, now)[0]!.status).toBe("fresh");
    const silent = [day(-60, ["Kim"]), day(-50, ["Kim"])];
    expect(derivePeople(silent, now)[0]!.status).toBe("cold");
  });
});
