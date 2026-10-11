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

  it("proxies calendar feeds and refuses private hosts", async () => {
    const proxied = createApi({ chiefOfStaff: new HeuristicChiefOfStaff(), calendarFeeds: { fetchIcs: async (url) => `BEGIN:VCALENDAR\nX-URL:${url}\nEND:VCALENDAR` } });
    const ok = await proxied.request(`${ROUTES.ics}?url=${encodeURIComponent("https://example.com/a.ics")}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("X-URL:https://example.com/a.ics");
    const bad = await app.request(`${ROUTES.ics}?url=${encodeURIComponent("https://127.0.0.1/a.ics")}`);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/public host/);
    expect((await app.request(ROUTES.ics)).status).toBe(400);
  });

  it("reads issues with a local Linear key in a header, and asks for one otherwise", async () => {
    const withSource = createApi({
      chiefOfStaff: new HeuristicChiefOfStaff(),
      issueSourceFor: (key) => ({ name: "linear", assignedToMe: async () => [{ source: "linear", id: "a", identifier: "ENG-1", title: `key ${key}`, url: "https://l/ENG-1", state: "todo", priority: 3, dueDate: LocalDate.parse("2026-10-16") }] }),
    });
    const ok = await withSource.request(ROUTES.issues, { headers: { "x-linear-api-key": "lin_x" } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ source: "linear", issues: [{ source: "linear", id: "a", identifier: "ENG-1", title: "key lin_x", url: "https://l/ENG-1", state: "todo", priority: 3, dueDate: "2026-10-16" }] });
    const none = await withSource.request(ROUTES.issues);
    expect(none.status).toBe(401);
    expect(((await none.json()) as { error: string }).error).toMatch(/Connect Linear/);
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
