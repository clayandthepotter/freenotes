import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { LocalDate, createTodo, validateAchievementReport, validateExecutionPlan } from "@freenotes/core";
import { AnthropicChiefOfStaff, ChiefOfStaffError } from "./anthropic-chief-of-staff.js";

const today = LocalDate.parse("2026-10-12");
const context = { today };
const todos = [
  createTodo("T1", 0, { title: "Finish Q4 budget deck", estimatedMinutes: 120, deadline: { date: today.addDays(4) } }),
  createTodo("T2", 1, { title: "Call the dentist" }),
];

function fakeClient(parsed_output: unknown, extra: Partial<{ stop_reason: string; stop_details: unknown }> = {}) {
  const client = new Anthropic({ apiKey: "test-key" });
  const parse = vi.fn().mockResolvedValue({ parsed_output, stop_reason: "end_turn", stop_details: null, ...extra });
  (client.beta.messages as unknown as { parse: typeof parse }).parse = parse;
  return { client, parse };
}

describe("AnthropicChiefOfStaff", () => {
  it("sends a structured-output request with the default model, effort and fallbacks", async () => {
    const { client, parse } = fakeClient({ refinements: [] });
    const cos = new AnthropicChiefOfStaff({ client });
    await cos.refineTodos({ todos, rawBraindump: "- x", context });

    expect(parse).toHaveBeenCalledTimes(1);
    const params = parse.mock.calls[0]![0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
    expect(params.output_config.effort).toBe("high");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.messages[0].content).toContain("Finish Q4 budget deck");
    expect(params.thinking).toBeUndefined();
  });

  it("can disable fallbacks and change model/effort", async () => {
    const { client, parse } = fakeClient({ refinements: [] });
    const cos = new AnthropicChiefOfStaff({ client, fallbacks: false, model: "claude-sonnet-5-5", effort: "medium" });
    await cos.refineTodos({ todos, rawBraindump: "", context });
    const params = parse.mock.calls[0]![0];
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(params.betas).toBeUndefined();
    expect(params.fallbacks).toBeUndefined();
    expect(params.output_config.effort).toBe("medium");
    expect(cos.name).toBe("claude (claude-sonnet-5-5)");
  });

  it("maps refinements, dropping nulls and unknown todos", async () => {
    const { client } = fakeClient({
      refinements: [
        { todoId: "T2", estimatedMinutes: 15, priority: null, clarifiedTitle: "Call the dentist to book a cleaning", rationale: "Short call." },
        { todoId: "T9", estimatedMinutes: 5, priority: "low", clarifiedTitle: null, rationale: "ghost" },
      ],
    });
    const out = await new AnthropicChiefOfStaff({ client }).refineTodos({ todos, rawBraindump: "", context });
    expect(out).toEqual([{ todoId: "T2", estimatedMinutes: 15, clarifiedTitle: "Call the dentist to book a cleaning", rationale: "Short call." }]);
  });

  it("maps an execution plan into a valid domain plan", async () => {
    const { client } = fakeClient({
      objective: "A board-ready deck.",
      definitionOfDone: ["CFO has reviewed it"],
      steps: [
        { action: "Open last quarter's deck", detail: null, estimatedMinutes: 10 },
        { action: "Update the numbers", detail: "Pull from the finance sheet", estimatedMinutes: 60 },
      ],
      inputs: ["Finance sheet"],
      risks: ["Numbers not final"],
      firstAction: "Open last quarter's deck",
    });
    const plan = await new AnthropicChiefOfStaff({ client }).planExecution({ todo: todos[0]!, otherTodos: [todos[1]!], context });
    expect(() => validateExecutionPlan(plan)).not.toThrow();
    expect(plan.steps).toEqual([
      { order: 1, action: "Open last quarter's deck", estimatedMinutes: 10 },
      { order: 2, action: "Update the numbers", detail: "Pull from the finance sheet", estimatedMinutes: 60 },
    ]);
    expect(plan.source).toBe("assistant");
  });

  it("maps a report and guarantees one reflection per completed todo", async () => {
    const { client } = fakeClient({
      headline: "Both done.",
      achievements: [
        { todoId: "T2", summary: "Booked.", significance: "minor", onTime: null },
        { todoId: "T1", summary: "Shipped.", significance: "major", onTime: true },
        { todoId: "T7", summary: "ghost", significance: "major", onTime: true },
      ],
      improvements: [{ theme: "Estimation", observation: "o", suggestion: "s", relatedTodoIds: ["T1", "T7"] }],
      reflections: [{ todoId: "T1", question: "What made the deck land" }], // missing T2, missing '?'
    });
    const results = [
      { todoId: "T1", status: "done" as const, notes: "" },
      { todoId: "T2", status: "done" as const, notes: "" },
    ];
    const report = await new AnthropicChiefOfStaff({ client }).composeAchievementReport({ todos, results, rawResults: "", plans: {}, context });
    expect(() => validateAchievementReport(report, ["T1", "T2"])).not.toThrow();
    expect(report.achievements.map((a) => a.todoId)).toEqual(["T1", "T2"]);
    expect(report.achievements[0]!.title).toBe("Finish Q4 budget deck");
    expect(report.improvements[0]!.relatedTodoIds).toEqual(["T1"]);
    expect(report.reflections).toEqual([
      { todoId: "T1", question: "What made the deck land?" },
      { todoId: "T2", question: expect.stringContaining("Call the dentist") },
    ]);
  });

  it("surfaces refusals and unparseable answers as ChiefOfStaffError", async () => {
    const refused = fakeClient(null, { stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms", explanation: "nope" } });
    await expect(new AnthropicChiefOfStaff({ client: refused.client }).refineTodos({ todos, rawBraindump: "", context })).rejects.toMatchObject({
      name: "ChiefOfStaffError",
      code: "refusal",
    });

    const garbage = fakeClient(null);
    await expect(new AnthropicChiefOfStaff({ client: garbage.client }).refineTodos({ todos, rawBraindump: "", context })).rejects.toBeInstanceOf(ChiefOfStaffError);
  });
});
