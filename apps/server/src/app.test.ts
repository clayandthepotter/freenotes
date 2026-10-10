import { describe, expect, it } from "vitest";
import { createTodo, HeuristicChiefOfStaff } from "@freenotes/core";
import { refineCodec, ROUTES } from "@freenotes/ai-http";
import { createApp } from "./app.js";
import { LocalDate } from "@freenotes/core";

const app = createApp({ chiefOfStaff: new HeuristicChiefOfStaff() });

describe("server app", () => {
  it("answers status and health", async () => {
    expect(await (await app.request(ROUTES.status)).json()).toEqual({ available: true, name: "heuristic" });
    expect((await app.request("/api/health")).status).toBe(200);
  });

  it("refines todos over HTTP", async () => {
    const body = refineCodec.encode({ todos: [createTodo("T1", 0, { title: "Call the dentist" })], rawBraindump: "- Call the dentist", context: { today: LocalDate.parse("2026-10-12") } });
    const res = await app.request(ROUTES.refine, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { refinements: Array<{ todoId: string; estimatedMinutes: number }> };
    expect(json.refinements[0]).toMatchObject({ todoId: "T1", estimatedMinutes: 20 });
  });

  it("returns 400 on malformed JSON", async () => {
    const res = await app.request(ROUTES.plan, { method: "POST", body: "{nope", headers: { "content-type": "application/json" } });
    expect(res.status).toBe(400);
  });
});
