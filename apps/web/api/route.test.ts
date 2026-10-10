import { describe, expect, it } from "vitest";

describe("Vercel API function", () => {
  it("answers status through the named GET export", async () => {
    const { GET, POST } = await import("./[...route].js");
    const res = await GET(new Request("http://localhost/api/status"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ available: true });
    expect(POST).toBe(GET);
  });
});
