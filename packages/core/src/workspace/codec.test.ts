import { describe, expect, it } from "vitest";
import { LocalDate, LocalTime } from "../shared/local-date.js";
import { TimeRange } from "../shared/time-range.js";
import { createComposition } from "../composition/composition.js";
import { createTodo } from "../planning/todo.js";
import { buildSchedule } from "../planning/scheduler.js";
import { deserializeWorkspace, serializeWorkspace } from "./codec.js";
import { emptyWorkspace, nextTodoNumber, openTodos, type Workspace } from "./workspace.js";

describe("workspace codec", () => {
  it("round-trips a populated workspace through JSON", () => {
    const todos = [
      createTodo("T1", 0, { title: "a", estimatedMinutes: 60, deadline: { date: LocalDate.parse("2026-10-13"), time: LocalTime.of(15) } }),
      createTodo("T3", 1, { title: "b" }),
    ];
    const base = emptyWorkspace();
    const schedule = buildSchedule({ todos, workingHours: base.settings.workingHours, from: new Date(2026, 9, 12, 9), busy: [TimeRange.of(new Date(2026, 9, 12, 9), new Date(2026, 9, 12, 10))] });
    const ws: Workspace = {
      ...base,
      todos,
      schedule,
      compositions: [createComposition("c1", new Date("2026-10-12T08:00:00Z"), { kind: "braindump", title: "Monday dump", body: "- a\n- b", todoIds: ["T1", "T3"] })],
      plans: { T1: { todoId: "T1", objective: "o", definitionOfDone: ["d"], steps: [{ order: 1, action: "x" }], inputs: [], risks: [], firstAction: "f", source: "heuristic" } },
      results: [{ todoId: "T1", status: "done", notes: "ok" }],
      progress: [{ todoId: "T1", step: 1, done: true, note: "written inline", updatedAt: new Date("2026-10-12T09:30:00Z") }],
      reflections: [{ todoId: "T1", question: "Why?", answer: "Because.", answeredAt: new Date("2026-10-13T10:00:00Z") }],
    };

    const json = JSON.stringify(serializeWorkspace(ws));
    const back = deserializeWorkspace(JSON.parse(json));

    expect(serializeWorkspace(back)).toEqual(serializeWorkspace(ws));
    expect(back.todos[0]!.deadline?.date.toString()).toBe("2026-10-13");
    expect(back.todos[0]!.deadline?.time?.toString()).toBe("15:00");
    expect(back.schedule!.blocks[0]!.range.start).toEqual(schedule.blocks[0]!.range.start);
    expect(back.compositions[0]!.createdAt).toEqual(new Date("2026-10-12T08:00:00Z"));
    expect(back.reflections[0]!.answeredAt).toEqual(new Date("2026-10-13T10:00:00Z"));
    expect(back.settings.workingHours.toJSON()).toEqual(base.settings.workingHours.toJSON());
    expect(nextTodoNumber(back)).toBe(4);
    expect(openTodos(back).map((t) => t.id)).toEqual(["T3"]);
  });

  it("rejects unknown versions", () => {
    expect(() => deserializeWorkspace({ version: 2 })).toThrow(/Unsupported workspace version/);
  });

  it("reads snapshots written before step progress existed", () => {
    const snap = JSON.parse(JSON.stringify(serializeWorkspace(emptyWorkspace()))) as Record<string, unknown>;
    delete snap["progress"];
    expect(deserializeWorkspace(snap).progress).toEqual([]);
  });
});
