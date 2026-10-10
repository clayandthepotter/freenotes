import { describe, expect, it } from "vitest";
import { createTodo, HeuristicChiefOfStaff } from "@freenotes/core";
import { refineCodec, ROUTES } from "@freenotes/ai-http";
import { createApi } from "./api.js";
import { LocalDate } from "@freenotes/core";

const app = createApi({ chiefOfStaff: new HeuristicChiefOfStaff() });

describe("chief-of-staff API", () => {
  it("answers status and health", async () => {
    expect(await (await app.request(ROUTES.status)).json()).toEqual({ available: true, name: "heuristic", accounts: false, provider: "default" });
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

describe("chiefOfStaffFromEnv", () => {
  it("falls back to heuristic without credentials and picks Claude with them", async () => {
    const { chiefOfStaffFromEnv } = await import("./env.js");
    expect(chiefOfStaffFromEnv({}).name).toBe("heuristic");
    expect(chiefOfStaffFromEnv({ FREENOTES_AI: "heuristic", ANTHROPIC_API_KEY: "k" }).name).toBe("heuristic");
    expect(chiefOfStaffFromEnv({ ANTHROPIC_API_KEY: "k" }).name).toBe("claude (claude-opus-5-5)");
    expect(chiefOfStaffFromEnv({ ANTHROPIC_API_KEY: "k", FREENOTES_MODEL: "claude-sonnet-5-5" }).name).toBe("claude (claude-sonnet-5-5)");
  });
});
