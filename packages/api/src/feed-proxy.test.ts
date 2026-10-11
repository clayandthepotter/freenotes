import { describe, expect, it } from "vitest";
import { assertPublicFeedUrl, FeedProxy } from "./feed-proxy.js";

describe("assertPublicFeedUrl", () => {
  it("accepts public https and rejects private, plain http and credentials", () => {
    expect(assertPublicFeedUrl("https://calendar.google.com/calendar/ical/x/basic.ics").hostname).toBe("calendar.google.com");
    expect(() => assertPublicFeedUrl("http://calendar.google.com/x.ics")).toThrow(/https/);
    expect(() => assertPublicFeedUrl("https://localhost/x.ics")).toThrow(/public host/);
    expect(() => assertPublicFeedUrl("https://10.0.0.5/x.ics")).toThrow(/public host/);
    expect(() => assertPublicFeedUrl("https://169.254.169.254/latest/meta-data")).toThrow(/public host/);
    expect(() => assertPublicFeedUrl("https://user:pw@example.com/x.ics")).toThrow(/credentials/);
    expect(assertPublicFeedUrl("http://localhost:9999/x.ics", true).port).toBe("9999");
  });
});

describe("FeedProxy", () => {
  const fake = (status: number, body: string): typeof fetch => (async () => new Response(body, { status })) as unknown as typeof fetch;
  it("returns calendar text and explains the common mistakes", async () => {
    expect(await new FeedProxy({ fetch: fake(200, "BEGIN:VCALENDAR\nEND:VCALENDAR") }).fetchIcs("https://example.com/a.ics")).toContain("VCALENDAR");
    await expect(new FeedProxy({ fetch: fake(200, "<html>sign in</html>") }).fetchIcs("https://example.com/a.ics")).rejects.toThrow(/did not return a calendar/);
    await expect(new FeedProxy({ fetch: fake(403, "") }).fetchIcs("https://example.com/a.ics")).rejects.toThrow(/answered 403/);
    await expect(new FeedProxy({ fetch: fake(200, "BEGIN:VCALENDAR".padEnd(50, "x")), maxBytes: 20 }).fetchIcs("https://example.com/a.ics")).rejects.toThrow(/too large/);
  });
});
