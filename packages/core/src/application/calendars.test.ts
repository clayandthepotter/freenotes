import { describe, expect, it } from "vitest";
import { HeuristicChiefOfStaff } from "../adapters/heuristic/heuristic-chief-of-staff.js";
import { InMemoryWorkspaceRepository } from "../adapters/memory/in-memory-workspace-repository.js";
import { fixedClock } from "../shared/clock.js";
import { sequentialIdGenerator } from "../shared/ids.js";
import { deserializeWorkspace, serializeWorkspace } from "../workspace/codec.js";
import { Freenotes } from "./freenotes.js";

const FEED = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:m1
DTSTART:20261012T100000Z
DTEND:20261012T110000Z
SUMMARY:Board call
ATTENDEE;CN=Priya:mailto:p@x.com
END:VEVENT
BEGIN:VEVENT
UID:m2
DTSTART:20261012T090000Z
DTEND:20261012T093000Z
RRULE:FREQ=DAILY;COUNT=5
SUMMARY:Standup
END:VEVENT
END:VCALENDAR`;

function app(feeds: Record<string, string | Error>) {
  const fetched: string[] = [];
  const fn = new Freenotes({
    repository: new InMemoryWorkspaceRepository(),
    chiefOfStaff: new HeuristicChiefOfStaff(),
    clock: fixedClock(new Date(2026, 9, 12, 8, 0)), // Monday 08:00 (UTC in tests)
    ids: sequentialIdGenerator("id"),
    calendarFeeds: {
      async fetchIcs(url) {
        fetched.push(url);
        const r = feeds[url];
        if (r === undefined) throw new Error(`no feed for ${url}`);
        if (r instanceof Error) throw r;
        return r;
      },
    },
  });
  return { fn, fetched };
}

describe("calendars", () => {
  it("connects a feed, pulls its events and keeps meetings out of the schedule", async () => {
    const { fn, fetched } = app({ "https://cal.example.com/work.ics": FEED });
    const out = await fn.connectCalendar({ label: "Work", url: "webcal://cal.example.com/work.ics" });
    expect(out.calendar).toMatchObject({ id: "id1", label: "Work", color: "#6c5ce7", source: { kind: "ics", url: "https://cal.example.com/work.ics" } });
    expect(fetched).toEqual(["https://cal.example.com/work.ics"]);
    expect(out.synced).toEqual(["id1"]);
    const ws = await fn.workspace();
    expect(ws.calendar.events.map((e) => e.title)).toEqual(["Standup", "Board call", "Standup", "Standup", "Standup", "Standup"]);
    expect(ws.calendar.calendars[0]!.lastSyncedAt).toEqual(new Date(2026, 9, 12, 8, 0));

    await fn.braindump({ text: "- Write the memo ~3h", refine: false });
    const scheduled = await fn.schedule();
    const blocks = scheduled.schedule.blocks.map((b) => [b.range.start.toISOString(), b.range.end.toISOString()]);
    // Working hours start 09:00; standup 09:00–09:30 and the board call 10:00–11:00 are busy, so work starts 09:30 and splits around the call.
    expect(blocks[0]).toEqual(["2026-10-12T09:30:00.000Z", "2026-10-12T10:00:00.000Z"]);
    expect(blocks[1]![0]).toBe("2026-10-12T11:00:00.000Z");
  });

  it("refuses duplicates and bad addresses", async () => {
    const { fn } = app({ "https://cal.example.com/work.ics": FEED });
    await fn.connectCalendar({ label: "Work", url: "https://cal.example.com/work.ics" });
    await expect(fn.connectCalendar({ label: "Again", url: "https://cal.example.com/work.ics" })).rejects.toThrow(/already connected/);
    await expect(fn.connectCalendar({ label: "Nope", url: "file:///etc/passwd" })).rejects.toThrow(/https/);
  });

  it("keeps the last events and records the error when a feed fails, then removes cleanly", async () => {
    const feeds: Record<string, string | Error> = { "https://cal.example.com/work.ics": FEED };
    const { fn } = app(feeds);
    await fn.connectCalendar({ label: "Work", url: "https://cal.example.com/work.ics" });
    feeds["https://cal.example.com/work.ics"] = new Error("HTTP 403");
    const sync = await fn.syncCalendars();
    expect(sync.failed).toEqual([{ calendarId: "id1", error: "HTTP 403" }]);
    const ws = await fn.workspace();
    expect(ws.calendar.events).toHaveLength(6);
    expect(ws.calendar.calendars[0]!.lastError).toBe("HTTP 403");

    const back = deserializeWorkspace(JSON.parse(JSON.stringify(serializeWorkspace(ws))));
    expect(back.calendar.events[1]!.range.start.toISOString()).toBe("2026-10-12T10:00:00.000Z");
    expect(back.calendar.calendars[0]!.lastError).toBe("HTTP 403");

    const removed = await fn.removeCalendar("id1");
    expect(removed.calendar.calendars).toEqual([]);
    expect(removed.calendar.events).toEqual([]);
    await expect(fn.removeCalendar("id1")).rejects.toThrow(/No such calendar/);
  });
});
