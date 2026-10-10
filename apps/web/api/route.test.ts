import { describe, expect, it } from "vitest";

describe("Vercel API function", () => {
  it("answers status through the hono/vercel handler", async () => {
    const { default: handler } = await import("./[[...route]].js");
    const res = await handler(new Request("http://localhost/api/chief-of-staff/status"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ available: true });
  });
});
