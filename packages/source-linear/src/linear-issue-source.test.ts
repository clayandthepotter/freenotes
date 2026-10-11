import { describe, expect, it } from "vitest";
import { LinearIssueSource } from "./linear-issue-source.js";

const NODES = [
  { id: "a", identifier: "ENG-1", title: "Fix login", url: "https://linear.app/t/ENG-1", dueDate: "2026-10-16", estimate: 2, priority: 1, state: { type: "started" }, project: { name: "Launch" } },
  { id: "b", identifier: "ENG-2", title: "Old one", url: "https://linear.app/t/ENG-2", dueDate: null, estimate: null, priority: 0, state: { type: "completed" }, project: null },
  { id: "c", identifier: "ENG-3", title: "Dropped", url: "https://linear.app/t/ENG-3", dueDate: null, estimate: null, priority: 4, state: { type: "canceled" }, project: null },
];

function fetchWith(handler: (init: RequestInit) => Response): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => handler(init ?? {})) as unknown as typeof fetch;
}

describe("LinearIssueSource", () => {
  it("sends the key raw, filters for open or recently closed, and maps states", async () => {
    let seen: { headers?: Record<string, string>; body?: string } = {};
    const src = new LinearIssueSource({
      apiKey: " lin_api_x ",
      now: () => new Date("2026-10-12T00:00:00Z"),
      fetch: fetchWith((init) => {
        seen = { headers: init.headers as Record<string, string>, body: String(init.body) };
        return new Response(JSON.stringify({ data: { viewer: { name: "Clay", assignedIssues: { nodes: NODES } } } }), { status: 200 });
      }),
    });
    const issues = await src.assignedToMe();
    expect(seen.headers?.["authorization"]).toBe("lin_api_x");
    expect(JSON.parse(seen.body!).variables.filter.or[1].updatedAt.gt).toBe("2026-09-12T00:00:00.000Z");
    expect(issues.map((i) => [i.identifier, i.state, i.priority])).toEqual([
      ["ENG-1", "in-progress", 1],
      ["ENG-2", "done", 0],
      ["ENG-3", "cancelled", 4],
    ]);
    expect(issues[0]).toMatchObject({ estimatePoints: 2, project: "Launch" });
    expect(issues[0]!.dueDate?.toString()).toBe("2026-10-16");
  });

  it("explains auth failures and GraphQL errors", async () => {
    await expect(new LinearIssueSource({ apiKey: "bad", fetch: fetchWith(() => new Response("", { status: 401 })) }).assignedToMe()).rejects.toThrow(/rejected the API key/);
    await expect(new LinearIssueSource({ apiKey: "k", fetch: fetchWith(() => new Response(JSON.stringify({ errors: [{ message: "boom" }] }), { status: 200 })) }).assignedToMe()).rejects.toThrow(/boom/);
    expect(() => new LinearIssueSource({ apiKey: "  " })).toThrow(/required/);
  });
});
