import { describe, expect, it } from "vitest";
import { applyProfilePatch, describeProfile, emptyProfile } from "./profile.js";
import { STYLE_DIMENSIONS, WORKING_STYLE_QUIZ, scoreWorkingStyle, type QuizAnswers, type StyleDimension } from "./working-style.js";

function answersFor(pick: (i: number) => StyleDimension): QuizAnswers {
  const out: Record<string, number> = {};
  WORKING_STYLE_QUIZ.forEach((q, i) => {
    out[q.id] = q.options.findIndex((o) => o.dimension === pick(i));
  });
  return out;
}

describe("the working-style quiz", () => {
  it("has eight questions, each offering every dimension exactly once", () => {
    expect(WORKING_STYLE_QUIZ).toHaveLength(8);
    for (const q of WORKING_STYLE_QUIZ) {
      expect(q.options.map((o) => o.dimension).sort()).toEqual([...STYLE_DIMENSIONS].sort());
      expect(new Set(WORKING_STYLE_QUIZ.map((x) => x.id)).size).toBe(WORKING_STYLE_QUIZ.length);
    }
  });

  it("names a clear preference", () => {
    const style = scoreWorkingStyle(answersFor(() => "triage"));
    expect(style).toMatchObject({ name: "Triage First", primary: "triage", scores: { triage: 8, capture: 0, improve: 0, align: 0 } });
    expect(style.secondary).toBeUndefined();
    expect(style.adaptations).toHaveLength(2);
  });

  it("names a tie as a pairing", () => {
    const style = scoreWorkingStyle(answersFor((i) => (i % 2 === 0 ? "capture" : "improve")));
    expect(style.name).toBe("Capture Everything / Measure and Adjust");
    expect(style).toMatchObject({ primary: "capture", secondary: "improve" });
  });

  it("calls a spread a balanced hybrid", () => {
    const style = scoreWorkingStyle(answersFor((i) => STYLE_DIMENSIONS[i % 4]!));
    expect(style.name).toBe("Balanced Hybrid");
    expect(style.scores).toEqual({ triage: 2, capture: 2, improve: 2, align: 2 });
  });

  it("keeps a strong lead with a close second as the lead style", () => {
    const style = scoreWorkingStyle(answersFor((i) => (i < 4 ? "align" : i < 7 ? "triage" : "improve")));
    expect(style).toMatchObject({ name: "Values Led", primary: "align", secondary: "triage" });
    const clear = scoreWorkingStyle(answersFor((i) => (i < 6 ? "align" : "triage")));
    expect(clear.secondary).toBeUndefined();
  });

  it("ignores unanswered or out-of-range answers", () => {
    expect(scoreWorkingStyle({}).name).toBe("Balanced Hybrid");
    expect(scoreWorkingStyle({ wake: 99, nope: 0 }).scores).toEqual({ triage: 0, capture: 0, improve: 0, align: 0 });
  });
});

describe("profile", () => {
  it("applies patches, trims, de-duplicates and clears with null", () => {
    const now = new Date("2026-10-12T08:00:00Z");
    let p = applyProfilePatch(emptyProfile(), { name: "  Clay ", goals: [" Ship v1 ", "Ship v1", ""], onboardedAt: now });
    expect(p).toEqual({ name: "Clay", goals: ["Ship v1"], boundaries: [], onboardedAt: now });
    p = applyProfilePatch(p, { name: null, onboardedAt: null, boundaries: ["No meetings before 10"] });
    expect(p).toEqual({ goals: ["Ship v1"], boundaries: ["No meetings before 10"] });
  });

  it("describes itself for the assistant, or says nothing", () => {
    expect(describeProfile(emptyProfile())).toBe("");
    const style = scoreWorkingStyle(answersFor(() => "improve"));
    const text = describeProfile({ name: "Clay", style, goals: ["Ship v1"], boundaries: ["No weekends"] });
    expect(text).toContain("name is Clay");
    expect(text).toContain("Working style: Measure and Adjust");
    expect(text).toContain('"Ship v1"');
    expect(text).toContain('"No weekends"');
  });
});
