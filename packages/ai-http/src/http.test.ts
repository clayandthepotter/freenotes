import { describe, expect, it } from "vitest";
import { buildSchedule, createTodo, HeuristicChiefOfStaff, LocalDate, LocalTime, WorkingHours, type ChiefOfStaff } from "@freenotes/core";
import { HttpChiefOfStaff, HttpChiefOfStaffError } from "./client.js";
import { createChiefOfStaffHandlers } from "./handlers.js";
import { planCodec, refineCodec, reportCodec, ROUTES } from "./protocol.js";

const today = LocalDate.parse("2026-10-12");
const context = { today, profile: "Head of product" };
const todos = [
  createTodo("T1", 0, { title: "Finish Q4 budget deck", estimatedMinutes: 120, deadline: { date: today.addDays(4), time: LocalTime.of(15) } }),
  createTodo("T2", 1, { title: "Call the dentist" }),
];
const schedule = buildSchedule({ todos, workingHours: WorkingHours.default(), from: today.at(LocalTime.of(9)) });

describe("protocol codecs", () => {
  it("round-trip every request type through JSON", () => {
    const refine = { todos, rawBraindump: "- x", context };
    const refineBack = refineCodec.decode(JSON.parse(JSON.stringify(refineCodec.encode(refine))));
    expect(refineBack.todos[0]!.deadline?.time?.toString()).toBe("15:00");
    expect(refineBack.context.today.toString()).toBe("2026-10-12");
    expect(refineBack.context.profile).toBe("Head of product");

    const plan = { todo: todos[0]!, otherTodos: [todos[1]!], schedule, context };
    const planBack = planCodec.decode(JSON.parse(JSON.stringify(planCodec.encode(plan))));
    expect(planBack.schedule!.blocks[0]!.range.start).toEqual(schedule.blocks[0]!.range.start);

    const report = { todos, results: [{ todoId: "T1", status: "done" as const, notes: "" }], rawResults: "T1 done", schedule, plans: {}, context };
    const reportBack = reportCodec.decode(JSON.parse(JSON.stringify(reportCodec.encode(report))));
    expect(reportBack.schedule!.warnings).toEqual(schedule.warnings);
    expect(reportBack.results).toEqual(report.results);
  });
});

/** Wires the client straight into the handlers through a fake fetch — no network, no framework. */
function loopback(chief: ChiefOfStaff = new HeuristicChiefOfStaff()) {
  const handlers = createChiefOfStaffHandlers(chief);
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    try {
      if (url.endsWith(ROUTES.status)) return json(handlers.status());
      if (url.endsWith(ROUTES.refine)) return json(await handlers.refine(body));
      if (url.endsWith(ROUTES.plan)) return json(await handlers.plan(body));
      if (url.endsWith(ROUTES.report)) return json(await handlers.report(body));
      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  };
  return new HttpChiefOfStaff({ baseUrl: "http://test", fetch: fetchImpl });
}

describe("HttpChiefOfStaff ↔ handlers", () => {
  it("behaves like the wrapped chief of staff", async () => {
    const remote = loopback();
    const local = new HeuristicChiefOfStaff();

    expect(await remote.status()).toEqual({ available: true, name: "heuristic" });
    expect(await remote.refineTodos({ todos, rawBraindump: "", context })).toEqual(await local.refineTodos({ todos, rawBraindump: "", context }));
    expect(await remote.planExecution({ todo: todos[0]!, otherTodos: [], schedule, context })).toEqual(await local.planExecution({ todo: todos[0]!, otherTodos: [], schedule, context }));
    const req = { todos, results: [{ todoId: "T1", status: "done" as const, notes: "ok" }], rawResults: "", schedule, plans: {}, context };
    expect(await remote.composeAchievementReport(req)).toEqual(await local.composeAchievementReport(req));
  });

  it("surfaces server errors", async () => {
    const failing = loopback({
      name: "boom",
      refineTodos: async () => {
        throw new Error("model exploded");
      },
      planExecution: async () => {
        throw new Error("x");
      },
      composeAchievementReport: async () => {
        throw new Error("x");
      },
    });
    await expect(failing.refineTodos({ todos, rawBraindump: "", context })).rejects.toMatchObject({ name: "HttpChiefOfStaffError", status: 500, message: "model exploded" } satisfies Partial<HttpChiefOfStaffError>);
  });

  it("reports unavailable when the server is unreachable", async () => {
    const dead = new HttpChiefOfStaff({ baseUrl: "http://test", fetch: async () => { throw new TypeError("fetch failed"); } });
    expect(await dead.status()).toEqual({ available: false });
  });
});
