import { describe, expect, it } from "vitest";
import { LocalDate, LocalTime } from "../shared/local-date.js";
import { TimeRange } from "../shared/time-range.js";
import { buildSchedule, deadlineInstant } from "./scheduler.js";
import { blocksFor, totalScheduledMinutes } from "./schedule.js";
import { createTodo, type TodoDraft } from "./todo.js";
import { WorkingHours } from "./working-hours.js";

// Monday 2026-10-12, 09:00 local. Tests run with TZ=UTC so local == UTC.
const monday9 = new Date(2026, 9, 12, 9, 0);
const hours = WorkingHours.default();

let n = 0;
const todo = (draft: TodoDraft) => createTodo(`T${++n}`, n, draft);
const day = (d: string) => LocalDate.parse(d);
const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const fmtBlock = (b: { range: TimeRange }) => `${fmt(b.range.start)}-${fmt(b.range.end)}`;

describe("WorkingHours", () => {
  it("yields clipped windows for working days only", () => {
    const windows = hours.windowsBetween(new Date(2026, 9, 9, 15, 0), new Date(2026, 9, 13, 12, 0)); // Fri 15:00 → Tue 12:00
    expect(windows.map((range) => fmtBlock({ range }))).toEqual(["10/9 15:00-10/9 17:00", "10/12 09:00-10/12 17:00", "10/13 09:00-10/13 12:00"]);
  });

  it("round-trips through JSON", () => {
    const custom = WorkingHours.of({ 1: { start: LocalTime.of(8), end: LocalTime.of(12) } });
    expect(WorkingHours.fromJSON(custom.toJSON()).toJSON()).toEqual({ "1": { start: "08:00", end: "12:00" } });
  });
});

describe("deadlineInstant", () => {
  it("uses end of working day for date-only deadlines and the given time otherwise", () => {
    expect(fmt(deadlineInstant({ date: day("2026-10-14") }, hours))).toBe("10/14 17:00");
    expect(fmt(deadlineInstant({ date: day("2026-10-14"), time: LocalTime.of(11, 30) }, hours))).toBe("10/14 11:30");
  });
});

describe("buildSchedule", () => {
  it("places a single todo at the start of the horizon", () => {
    const t = todo({ title: "a", estimatedMinutes: 60 });
    const s = buildSchedule({ todos: [t], workingHours: hours, from: monday9 });
    expect(s.blocks.map(fmtBlock)).toEqual(["10/12 09:00-10/12 10:00"]);
    expect(s.unscheduled).toEqual([]);
    expect(s.warnings).toEqual([]);
  });

  it("schedules deadline items earliest-deadline-first, then fills gaps with undated items by priority", () => {
    const later = todo({ title: "due Wed", estimatedMinutes: 60, deadline: { date: day("2026-10-14") } });
    const flexLow = todo({ title: "flex low", estimatedMinutes: 30, priority: "low" });
    const soon = todo({ title: "due Tue", estimatedMinutes: 60, deadline: { date: day("2026-10-13") } });
    const flexHigh = todo({ title: "flex high", estimatedMinutes: 30, priority: "high" });

    const s = buildSchedule({ todos: [later, flexLow, soon, flexHigh], workingHours: hours, from: monday9 });
    expect(s.blocks.map((b) => b.todoId)).toEqual([soon.id, later.id, flexHigh.id, flexLow.id]);
    expect(s.blocks.map(fmtBlock)).toEqual([
      "10/12 09:00-10/12 10:00",
      "10/12 10:15-10/12 11:15",
      "10/12 11:30-10/12 12:00",
      "10/12 12:15-10/12 12:45",
    ]);
  });

  it("splits long todos into focus blocks with breaks, across days when needed", () => {
    const big = todo({ title: "deep work", estimatedMinutes: 8 * 60 });
    const s = buildSchedule({ todos: [big], workingHours: hours, from: new Date(2026, 9, 12, 14, 0), policy: { maxBlockMinutes: 90, breakMinutes: 15 } });
    const blocks = blocksFor(s, big.id);
    expect(blocks.every((b) => b.range.durationMinutes <= 90)).toBe(true);
    expect(totalScheduledMinutes(s)).toBe(480);
    expect(blocks[0]!.part).toEqual({ index: 1, of: blocks.length });
    expect(blocks.at(-1)!.part.index).toBe(blocks.length);
    // Monday 14:00–17:00 holds 90 + 15 break + 75 (clipped to the end of the day); the rest spills to Tuesday.
    expect(blocks.map(fmtBlock).slice(0, 3)).toEqual(["10/12 14:00-10/12 15:30", "10/12 15:45-10/12 17:00", "10/13 09:00-10/13 10:30"]);
  });

  it("avoids busy ranges", () => {
    const t = todo({ title: "a", estimatedMinutes: 60 });
    const meeting = TimeRange.of(new Date(2026, 9, 12, 9, 0), new Date(2026, 9, 12, 10, 30));
    const s = buildSchedule({ todos: [t], workingHours: hours, from: monday9, busy: [meeting] });
    expect(s.blocks.map(fmtBlock)).toEqual(["10/12 10:30-10/12 11:30"]);
  });

  it("flags a deadline that cannot be met but still schedules the work", () => {
    const filler = todo({ title: "filler due today", estimatedMinutes: 7 * 60, deadline: { date: day("2026-10-12") } });
    const late = todo({ title: "due Tuesday 10:00", estimatedMinutes: 120, deadline: { date: day("2026-10-13"), time: LocalTime.of(10) } });
    const s = buildSchedule({ todos: [late, filler], workingHours: hours, from: monday9 });
    // The filler fits on Monday (finishes 16:40), so only the Tuesday item is at risk: it cannot start before Tuesday 09:00.
    expect(s.warnings).toEqual([
      { kind: "deadline-at-risk", todoId: late.id, deadlineAt: new Date(2026, 9, 13, 10, 0), finishesAt: new Date(2026, 9, 13, 11, 10) },
    ]);
    expect(blocksFor(s, filler.id).at(-1)!.range.end).toEqual(new Date(2026, 9, 12, 16, 40));
    expect(blocksFor(s, late.id).length).toBeGreaterThan(0);
  });

  it("flags deadlines already in the past", () => {
    const t = todo({ title: "overdue", estimatedMinutes: 30, deadline: { date: day("2026-10-09") } });
    const s = buildSchedule({ todos: [t], workingHours: hours, from: monday9 });
    expect(s.warnings).toEqual([{ kind: "deadline-passed", todoId: t.id, deadlineAt: new Date(2026, 9, 9, 17, 0) }]);
  });

  it("reports what does not fit in the horizon", () => {
    const huge = todo({ title: "huge", estimatedMinutes: 3 * 8 * 60 });
    const s = buildSchedule({ todos: [huge], workingHours: hours, from: monday9, policy: { horizonDays: 2, breakMinutes: 0 } });
    expect(s.unscheduled).toEqual([{ todoId: huge.id, remainingMinutes: 8 * 60, reason: "no-capacity-in-horizon" }]);
  });

  it("snaps the start to the granularity and never schedules into the past", () => {
    const t = todo({ title: "a", estimatedMinutes: 30 });
    const s = buildSchedule({ todos: [t], workingHours: hours, from: new Date(2026, 9, 12, 9, 7) });
    expect(s.blocks.map(fmtBlock)).toEqual(["10/12 09:15-10/12 09:45"]);
  });

  it("rounds estimates up to the granularity", () => {
    const t = todo({ title: "a", estimatedMinutes: 20 });
    const s = buildSchedule({ todos: [t], workingHours: hours, from: monday9 });
    expect(s.blocks[0]!.range.durationMinutes).toBe(30);
  });

  it("is deterministic", () => {
    const todos = [todo({ title: "x", estimatedMinutes: 45 }), todo({ title: "y", estimatedMinutes: 45, deadline: { date: day("2026-10-13") } })];
    const a = buildSchedule({ todos, workingHours: hours, from: monday9 });
    const b = buildSchedule({ todos, workingHours: hours, from: monday9 });
    expect(a.blocks.map(fmtBlock)).toEqual(b.blocks.map(fmtBlock));
  });
});
