import { describe, expect, it } from "vitest";
import { HeuristicChiefOfStaff } from "../adapters/heuristic/heuristic-chief-of-staff.js";
import { InMemoryWorkspaceRepository } from "../adapters/memory/in-memory-workspace-repository.js";
import { fixedClock } from "../shared/clock.js";
import { sequentialIdGenerator } from "../shared/ids.js";
import { Freenotes } from "./freenotes.js";

const BRAINDUMP = `
- Finish Q4 budget deck by Friday ~2h
- [high] Call the dentist
- Write launch post due Oct 20 (1h30m)
- Book flights !low
- Review PR #42 by tomorrow 3pm
`;

function app() {
  return new Freenotes({
    repository: new InMemoryWorkspaceRepository(),
    chiefOfStaff: new HeuristicChiefOfStaff(),
    clock: fixedClock(new Date(2026, 9, 12, 9, 0)), // Monday 09:00 local
    ids: sequentialIdGenerator("c"),
  });
}

describe("Freenotes end-to-end (heuristic chief of staff)", () => {
  it("runs the whole loop: braindump → schedule → plan → report → reflect", async () => {
    const fn = app();

    const captured = await fn.braindump({ text: BRAINDUMP });
    expect(captured.todos.map((t) => t.id)).toEqual(["T1", "T2", "T3", "T4", "T5"]);
    expect(captured.todos[1]).toMatchObject({ title: "Call the dentist", estimatedMinutes: 20, estimateSource: "assistant" });
    expect(captured.todos[0]).toMatchObject({ estimatedMinutes: 120, estimateSource: "explicit" }); // explicit estimates are never overridden
    expect(captured.todos[4]).toMatchObject({ priority: "high" }); // due tomorrow → high
    expect(captured.composition.kind).toBe("braindump");

    const scheduled = await fn.schedule();
    expect(scheduled.schedule.blocks[0]!.todoId).toBe("T5"); // earliest deadline first
    expect(scheduled.schedule.warnings).toEqual([]);
    expect(scheduled.composition.body).toContain("### Mon 12 Oct");

    const plans = await fn.planAll();
    expect(plans).toHaveLength(5);
    expect(plans[0]!.composition.body).toContain("Start here →");

    const reported = await fn.report(`
T1: done — shipped Thursday, CFO happy
T2 done
- [x] Write launch post — published
- Book flights: skipped, no dates yet
T5 blocked on CI
`);
    expect(reported.results.map((r) => r.status)).toEqual(["done", "done", "done", "skipped", "blocked"]);
    expect(reported.report.achievements.map((a) => a.todoId)).toEqual(["T1", "T3", "T2"]);
    expect(reported.report.reflections.map((r) => r.todoId)).toEqual(["T1", "T2", "T3"]);
    expect(reported.report.improvements.map((i) => i.theme)).toEqual(["Dependencies", "Prioritisation"]);
    expect(reported.composition.body).toContain("## Reflection");

    const reflected = await fn.reflect("T1", "Starting with the hardest slide made the rest easy.");
    expect(reflected.reflection.question).toContain("Finish Q4 budget deck");

    const ws = await fn.workspace();
    expect(ws.compositions.map((c) => c.kind)).toEqual([
      "braindump",
      "schedule",
      "execution-plan",
      "execution-plan",
      "execution-plan",
      "execution-plan",
      "execution-plan",
      "results",
      "achievement-report",
    ]);
    expect(ws.reflections).toHaveLength(1);

    // A follow-up braindump continues numbering and the schedule only contains open work.
    await fn.braindump({ text: "- Prep board update by Friday ~1h" });
    const again = await fn.schedule();
    const scheduledIds = new Set(again.schedule.blocks.map((b) => b.todoId));
    expect(scheduledIds).toEqual(new Set(["T5", "T6"])); // blocked T5 still needs time; done/skipped do not
  });

  it("refuses an empty braindump and an unanswerable reflection", async () => {
    const fn = app();
    await expect(fn.braindump({ text: "# nothing here\n" })).rejects.toThrow(/No todos found/);
    await expect(fn.reflect("T1", "x")).rejects.toThrow(/no open reflection question/);
  });

  it("records one todo at a time and composes the report on demand", async () => {
    const fn = app();
    await fn.braindump({ text: "- Finish deck by Friday ~2h\n- Call the dentist" });
    const r1 = await fn.recordOne("T1", "done", "shipped it");
    expect(r1.results).toEqual([{ todoId: "T1", status: "done", notes: "shipped it" }]);
    const r2 = await fn.recordOne("T2", "skipped");
    expect(r2.results).toEqual([{ todoId: "T2", status: "skipped", notes: "" }]);
    expect((await fn.workspace()).report).toBeUndefined();
    const composed = await fn.compose();
    expect(composed.report.reflections.map((r) => r.todoId)).toEqual(["T1"]);
    expect((await fn.workspace()).results.map((r) => r.status)).toEqual(["done", "skipped"]);
  });

  it("can skip refinement", async () => {
    const fn = app();
    const out = await fn.braindump({ text: "- Call the dentist", refine: false });
    expect(out.todos[0]).toMatchObject({ estimatedMinutes: 30, estimateSource: "default" });
    expect(out.refinements).toEqual([]);
  });
});
