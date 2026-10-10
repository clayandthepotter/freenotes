import { describe, expect, it } from "vitest";
import { LocalDate, LocalTime } from "./local-date.js";

describe("LocalDate", () => {
  it("parses and prints ISO dates", () => {
    expect(LocalDate.parse("2026-10-12").toString()).toBe("2026-10-12");
    expect(JSON.stringify(LocalDate.parse("2026-01-05"))).toBe('"2026-01-05"');
  });

  it("rejects impossible dates", () => {
    expect(() => LocalDate.parse("2026-02-30")).toThrow(/Invalid calendar date/);
    expect(() => LocalDate.parse("12/10/2026")).toThrow(/Expected YYYY-MM-DD/);
  });

  it("adds days across month boundaries", () => {
    expect(LocalDate.parse("2026-10-30").addDays(3).toString()).toBe("2026-11-02");
    expect(LocalDate.parse("2026-03-01").addDays(-1).toString()).toBe("2026-02-28");
  });

  it("knows weekdays and finds the next occurrence strictly in the future", () => {
    const sat = LocalDate.parse("2026-10-10"); // a Saturday
    expect(sat.weekday()).toBe(6);
    expect(sat.nextWeekday(1).toString()).toBe("2026-10-12"); // Monday
    expect(sat.nextWeekday(6).toString()).toBe("2026-10-17"); // same weekday → a week later
  });

  it("computes end of month", () => {
    expect(LocalDate.parse("2026-02-10").endOfMonth().toString()).toBe("2026-02-28");
    expect(LocalDate.parse("2028-02-10").endOfMonth().toString()).toBe("2028-02-29");
  });

  it("converts to instants at a local time", () => {
    const d = LocalDate.parse("2026-10-12").at(LocalTime.of(9, 30));
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
    expect(LocalDate.fromDate(d).toString()).toBe("2026-10-12");
  });
});

describe("LocalTime", () => {
  it("parses HH:MM", () => {
    expect(LocalTime.parse("9:05").toString()).toBe("09:05");
    expect(LocalTime.parse("17:00").minutesOfDay).toBe(1020);
  });

  it("rejects invalid times", () => {
    expect(() => LocalTime.of(24, 0)).toThrow();
    expect(() => LocalTime.parse("9pm")).toThrow();
  });
});
