import { describe, expect, it } from "vitest";
import { LocalDate } from "../shared/local-date.js";
import { parseDateExpression } from "./date-expression.js";

const today = LocalDate.parse("2026-10-10"); // Saturday

const d = (expr: string) => {
  const r = parseDateExpression(expr, today);
  return r ? `${r.date}${r.time ? " " + r.time : ""}` : undefined;
};

describe("parseDateExpression", () => {
  it("handles relative words", () => {
    expect(d("today")).toBe("2026-10-10");
    expect(d("tomorrow")).toBe("2026-10-11");
    expect(d("eod")).toBe("2026-10-10");
    expect(d("in 3 days")).toBe("2026-10-13");
    expect(d("in 2 weeks")).toBe("2026-10-24");
    expect(d("next week")).toBe("2026-10-12");
    expect(d("end of week")).toBe("2026-10-16");
    expect(d("end of month")).toBe("2026-10-31");
  });

  it("resolves weekday names to the next occurrence", () => {
    expect(d("Friday")).toBe("2026-10-16");
    expect(d("fri")).toBe("2026-10-16");
    expect(d("Saturday")).toBe("2026-10-17");
    expect(d("Monday")).toBe("2026-10-12");
  });

  it("parses explicit dates", () => {
    expect(d("2026-10-20")).toBe("2026-10-20");
    expect(d("10/20")).toBe("2026-10-20");
    expect(d("1/5")).toBe("2027-01-05"); // already passed this year → next year
    expect(d("Oct 20")).toBe("2026-10-20");
    expect(d("20 Oct")).toBe("2026-10-20");
    expect(d("October 20th, 2027")).toBe("2027-10-20");
  });

  it("combines dates with times", () => {
    expect(d("Friday 3pm")).toBe("2026-10-16 15:00");
    expect(d("tomorrow at 9:30am")).toBe("2026-10-11 09:30");
    expect(d("2026-10-20 17:00")).toBe("2026-10-20 17:00");
    expect(d("Monday noon")).toBe("2026-10-12 12:00");
    expect(d("3pm")).toBe("2026-10-10 15:00"); // bare time means today
    expect(d("12am tomorrow")).toBe("2026-10-11 00:00");
  });

  it("returns undefined for non-dates", () => {
    expect(d("the client")).toBeUndefined();
    expect(d("")).toBeUndefined();
    expect(d("2026-02-30")).toBeUndefined();
  });
});
