import { describe, expect, it } from "vitest";
import { buildSchedule, createTodo, emptyWorkspace, LocalDate, LocalTime, type Workspace } from "@freenotes/core";
import { attention, greeting, nameFromEmail, summaryLine } from "./brief.js";

const monday9 = new Date(2026, 9, 12, 9, 0);
const base = emptyWorkspace();

function withSchedule(todos: Workspace["todos"], from = monday9): Workspace {
  return { ...base, todos, schedule: buildSchedule({ todos, workingHours: base.settings.workingHours, from }) };
}

describe("greeting", () => {
  it("follows the clock and the name", () => {
    expect(greeting(new Date(2026, 9, 12, 8), "Clay")).toBe("Good morning, Clay.");
    expect(greeting(new Date(2026, 9, 12, 14))).toBe("Good afternoon.");
    expect(greeting(new Date(2026, 9, 12, 21), "Ada")).toBe("Good evening, Ada.");
  });
  it("derives a name from an email", () => {
    expect(nameFromEmail("clayton.prickett@example.com")).toBe("Clayton");
    expect(nameFromEmail("ADA@x.io")).toBe("Ada");
    expect(nameFromEmail(undefined)).toBeUndefined();
  });
});

describe("summaryLine", () => {
  it("covers empty, unscheduled, scheduled and clear days", () => {
    expect(summaryLine(base, monday9)).toMatch(/Nothing captured/);
    const todos = [createTodo("T1", 0, { title: "a", estimatedMinutes: 60 }), createTodo("T2", 1, { title: "b", estimatedMinutes: 30 })];
    expect(summaryLine({ ...base, todos }, monday9)).toBe("2 things waiting to be placed on the calendar.");
    expect(summaryLine(withSchedule(todos), monday9)).toBe("2 focus blocks today, 1h 30m planned. Light day.");
    const saturday = new Date(2026, 9, 10, 9);
    expect(summaryLine(withSchedule(todos, saturday), saturday)).toBe("Clear today. Next focus block Mon 12 Oct.");
  });
  it("mentions deadlines at risk", () => {
    const todos = [createTodo("T1", 0, { title: "late", estimatedMinutes: 60, deadline: { date: LocalDate.parse("2026-10-12"), time: LocalTime.of(9, 30) } })];
    expect(summaryLine(withSchedule(todos), monday9)).toMatch(/One deadline at risk\.$/);
  });
});

describe("attention", () => {
  it("ranks the current block, risks, next block, and unplanned work", () => {
    const todos = [
      createTodo("T1", 0, { title: "Deck", estimatedMinutes: 60, deadline: { date: LocalDate.parse("2026-10-12"), time: LocalTime.of(9, 30) } }),
      createTodo("T2", 1, { title: "Call", estimatedMinutes: 30 }),
    ];
    const ws = withSchedule(todos);
    const items = attention(ws, new Date(2026, 9, 12, 9, 15));
    expect(items.map((i) => i.kind)).toEqual(["now", "risk", "unplanned"]);
    expect(items[0]).toMatchObject({ todoId: "T1", title: "Deck" });
    const later = attention(ws, new Date(2026, 9, 12, 8, 0));
    expect(later.map((i) => i.kind)).toEqual(["risk", "unplanned"]); // "next" is the same todo as the risk, so it is not repeated
    const noRisk = withSchedule([createTodo("T2", 0, { title: "Call", estimatedMinutes: 30 })]);
    expect(attention(noRisk, new Date(2026, 9, 12, 8, 0)).map((i) => i.kind)).toEqual(["next", "unplanned"]);
  });
  it("asks for outcomes on past blocks and a report once outcomes exist", () => {
    const todos = [createTodo("T1", 0, { title: "a", estimatedMinutes: 30 })];
    const ws = withSchedule(todos);
    expect(attention(ws, new Date(2026, 9, 12, 12)).map((i) => i.kind)).toEqual(["unrecorded", "unplanned"]);
    const recorded = { ...ws, results: [{ todoId: "T1", status: "done" as const, notes: "" }] };
    expect(attention(recorded, new Date(2026, 9, 12, 12)).map((i) => i.kind)).toEqual(["review", "capture"]);
  });
});
