import { describe, expect, it } from "vitest";
import { orderAchievements, validateAchievementReport, type AchievementReport } from "./achievement-report.js";

const base: AchievementReport = {
  headline: "Two of three shipped",
  achievements: [
    { todoId: "T2", title: "b", summary: "s", significance: "minor", onTime: null },
    { todoId: "T1", title: "a", summary: "s", significance: "major", onTime: false },
    { todoId: "T3", title: "c", summary: "s", significance: "major", onTime: true },
  ],
  improvements: [],
  reflections: [
    { todoId: "T1", question: "What made this hard?" },
    { todoId: "T3", question: "What would you repeat?" },
  ],
  source: "heuristic",
};

describe("AchievementReport", () => {
  it("requires a reflection question for every completed todo", () => {
    expect(() => validateAchievementReport(base, ["T1", "T3"])).not.toThrow();
    expect(() => validateAchievementReport(base, ["T1", "T2", "T3"])).toThrow(/Missing reflection question for completed todo T2/);
  });

  it("requires reflections to be phrased as questions", () => {
    const bad = { ...base, reflections: [{ todoId: "T1", question: "Think about it." }] };
    expect(() => validateAchievementReport(bad, ["T1"])).toThrow(/not a question/);
  });

  it("orders achievements by significance, then on-time first", () => {
    expect(orderAchievements(base.achievements).map((a) => a.todoId)).toEqual(["T3", "T1", "T2"]);
  });
});
