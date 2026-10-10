import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { createTodo, LocalDate, validateExecutionPlan } from "@freenotes/core";
import { OpenAiCompatibleChiefOfStaff } from "./openai-chief-of-staff.js";

const context = { today: LocalDate.parse("2026-10-12") };
const todo = createTodo("T1", 0, { title: "Write launch post", estimatedMinutes: 60 });

function fakeClient(message: Record<string, unknown>, finish_reason = "stop") {
  const client = new OpenAI({ apiKey: "test" });
  const parse = vi.fn().mockResolvedValue({ choices: [{ message, finish_reason }] });
  (client.chat.completions as unknown as { parse: typeof parse }).parse = parse;
  return { client, parse };
}

describe("OpenAiCompatibleChiefOfStaff", () => {
  it("sends a json_schema response format and maps the parsed answer", async () => {
    const plan = {
      objective: "Published post.",
      definitionOfDone: ["Live on the blog"],
      steps: [{ action: "Outline", detail: null, estimatedMinutes: 10 }],
      inputs: [],
      risks: [],
      firstAction: "Open the editor",
    };
    const { client, parse } = fakeClient({ parsed: plan, content: JSON.stringify(plan), refusal: null });
    const cos = new OpenAiCompatibleChiefOfStaff({ client, model: "gpt-5", baseUrl: "https://api.groq.com/openai/v1" });
    const out = await cos.planExecution({ todo, otherTodos: [], context });

    expect(cos.name).toBe("api.groq.com (gpt-5)");
    const params = parse.mock.calls[0]![0];
    expect(params.model).toBe("gpt-5");
    expect(params.response_format.type).toBe("json_schema");
    expect(params.response_format.json_schema.name).toBe("execution_plan");
    expect(params.messages[0].role).toBe("system");
    expect(() => validateExecutionPlan(out)).not.toThrow();
    expect(out.firstAction).toBe("Open the editor");
  });

  it("falls back to parsing message content when the provider returns no parsed object", async () => {
    const { client } = fakeClient({ parsed: null, refusal: null, content: 'Sure! {"refinements":[{"todoId":"T1","estimatedMinutes":45,"priority":null,"clarifiedTitle":null,"rationale":"typical"}]}' });
    const out = await new OpenAiCompatibleChiefOfStaff({ client, model: "llama3" }).refineTodos({ todos: [todo], rawBraindump: "", context });
    expect(out).toEqual([{ todoId: "T1", estimatedMinutes: 45, rationale: "typical" }]);
  });

  it("surfaces refusals and garbage as ChiefOfStaffError", async () => {
    const refused = fakeClient({ parsed: null, refusal: "no", content: null });
    await expect(new OpenAiCompatibleChiefOfStaff({ client: refused.client, model: "m" }).refineTodos({ todos: [todo], rawBraindump: "", context })).rejects.toMatchObject({ code: "refusal" });
    const garbage = fakeClient({ parsed: null, refusal: null, content: "not json" });
    await expect(new OpenAiCompatibleChiefOfStaff({ client: garbage.client, model: "m" }).refineTodos({ todos: [todo], rawBraindump: "", context })).rejects.toMatchObject({ code: "unparseable" });
  });
});
