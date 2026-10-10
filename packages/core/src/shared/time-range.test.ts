import { describe, expect, it } from "vitest";
import { TimeRange, subtractAll } from "./time-range.js";

const t = (iso: string) => new Date(iso);

describe("TimeRange", () => {
  it("requires end after start", () => {
    expect(() => TimeRange.of(t("2026-10-12T10:00Z"), t("2026-10-12T10:00Z"))).toThrow();
  });

  it("measures duration in minutes", () => {
    expect(TimeRange.of(t("2026-10-12T09:00Z"), t("2026-10-12T10:30Z")).durationMinutes).toBe(90);
    expect(TimeRange.ofMinutes(t("2026-10-12T09:00Z"), 45).end.toISOString()).toBe(
      "2026-10-12T09:45:00.000Z",
    );
  });

  it("detects overlap with half-open semantics", () => {
    const a = TimeRange.of(t("2026-10-12T09:00Z"), t("2026-10-12T10:00Z"));
    const b = TimeRange.of(t("2026-10-12T10:00Z"), t("2026-10-12T11:00Z"));
    const c = TimeRange.of(t("2026-10-12T09:30Z"), t("2026-10-12T10:30Z"));
    expect(a.overlaps(b)).toBe(false);
    expect(a.overlaps(c)).toBe(true);
  });

  it("subtracts a range in the middle into two parts", () => {
    const day = TimeRange.of(t("2026-10-12T09:00Z"), t("2026-10-12T17:00Z"));
    const lunch = TimeRange.of(t("2026-10-12T12:00Z"), t("2026-10-12T13:00Z"));
    const parts = day.subtract(lunch);
    expect(parts.map(String)).toEqual([
      "2026-10-12T09:00:00.000Z → 2026-10-12T12:00:00.000Z",
      "2026-10-12T13:00:00.000Z → 2026-10-12T17:00:00.000Z",
    ]);
  });

  it("subtracts a covering range into nothing", () => {
    const a = TimeRange.of(t("2026-10-12T09:00Z"), t("2026-10-12T10:00Z"));
    const b = TimeRange.of(t("2026-10-12T08:00Z"), t("2026-10-12T11:00Z"));
    expect(a.subtract(b)).toEqual([]);
  });

  it("subtractAll removes several busy blocks and keeps results sorted", () => {
    const day = TimeRange.of(t("2026-10-12T09:00Z"), t("2026-10-12T17:00Z"));
    const busy = [
      TimeRange.of(t("2026-10-12T15:00Z"), t("2026-10-12T16:00Z")),
      TimeRange.of(t("2026-10-12T09:00Z"), t("2026-10-12T09:30Z")),
    ];
    expect(subtractAll([day], busy).map((r) => r.durationMinutes)).toEqual([330, 60]);
  });
});
