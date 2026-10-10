import { describe, expect, it } from "vitest";
import { LocalDate, LocalTime } from "../../shared/local-date.js";
import { createTodo } from "../../planning/todo.js";
import { buildSchedule } from "../../planning/scheduler.js";
import { WorkingHours } from "../../planning/working-hours.js";
import { validateExecutionPlan } from "../../execution/execution-plan.js";
import { validateAchievementReport } from "../../review/achievement-report.js";
import { HeuristicChiefOfStaff, classifyWork } from "./heuristic-chief-of-staff.js";

const today = LocalDate.parse("2026-10-12");
const context = { today };
const cos = new HeuristicChiefOfStaff();

describe("HeuristicChiefOfStaff", () => {
  it("classifies work from the title", () => {
    expect(classifyWork("Call the dentist").kind).toBe("communication");
    expect(classifyWork("Write launch post").kind).toBe("writing");
    expect(classifyWork("Finish Q4 budget deck").kind).toBe("build");
    expect(classifyWork("Something odd").kind).toBe("generic");
  });

  it("refines default estimates and raises priority for imminent deadlines", async () => {
    const todos = [
      createTodo("T1", 0, { title: "Call the dentist" }),
      createTodo("T2", 1, { title: "Write launch post", estimatedMinutes: 45 }),
      createTodo("T3", 2, { title: "Review PR", deadline: { date: today.addDays(1) } }),
    ];
    const refinements = await cos.refineTodos({ todos, rawBraindump: "", context });
    expect(refinements).toEqual([
      { todoId: "T1", estimatedMinutes: 20, rationale: expect.stringContaining("communication") },
      { todoId: "T3", estimatedMinutes: 45, priority: "high", rationale: expect.stringContaining("Due within two days") },
    ]);
  });

  it("produces a valid execution plan whose step estimates sum to the todo estimate", async () => {
    const todo = createTodo("T1", 0, { title: "Write launch post", estimatedMinutes: 90, deadline: { date: today.addDays(3) } });
    const plan = await cos.planExecution({ todo, otherTodos: [], context });
    expect(() => validateExecutionPlan(plan)).not.toThrow();
    expect(plan.steps.reduce((s, x) => s + (x.estimatedMinutes ?? 0), 0)).toBe(90);
    expect(plan.firstAction).toBe(plan.steps[0]!.action);
    expect(plan.risks.join(" ")).toMatch(/deadline/i);
  });

  it("composes a valid achievement report with one reflection per completed todo", async () => {
    const todos = [
      createTodo("T1", 0, { title: "Finish Q4 budget deck", estimatedMinutes: 120, priority: "high", deadline: { date: today.addDays(1) } }),
      createTodo("T2", 1, { title: "Call the dentist", estimatedMinutes: 20 }),
      createTodo("T3", 2, { title: "Book flights", estimatedMinutes: 20, priority: "low" }),
      createTodo("T4", 3, { title: "Write launch post", estimatedMinutes: 90 }),
    ];
    const schedule = buildSchedule({ todos, workingHours: WorkingHours.default(), from: today.at(LocalTime.of(9)) });
    const results = [
      { todoId: "T1", status: "done" as const, notes: "shipped Thursday" },
      { todoId: "T2", status: "done" as const, notes: "" },
      { todoId: "T3", status: "skipped" as const, notes: "no dates yet" },
    ];
    const report = await cos.composeAchievementReport({ todos, results, rawResults: "", schedule, plans: {}, context });

    expect(() => validateAchievementReport(report, ["T1", "T2"])).not.toThrow();
    expect(report.headline).toBe("2 of 3 reported items completed.");
    expect(report.achievements.map((a) => a.todoId)).toEqual(["T1", "T2"]); // major first
    expect(report.achievements[0]).toMatchObject({ significance: "major", onTime: true, summary: "Completed. Shipped Thursday" });
    expect(report.improvements.map((i) => i.theme)).toEqual(["Prioritisation", "Follow-through"]);
    expect(report.improvements[1]!.relatedTodoIds).toEqual(["T4"]);
    expect(report.reflections).toHaveLength(2);
    expect(report.reflections[0]!.question).toContain("Finish Q4 budget deck");
  });
});
