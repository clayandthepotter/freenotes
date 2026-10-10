import { describe, expect, it } from "vitest";
import type { ExecutionStep } from "./execution-plan.js";
import { progressFor, stepWantsWriting, updateStepProgress, type StepProgress } from "./step-progress.js";

const now = new Date("2026-10-12T10:00:00Z");

describe("updateStepProgress", () => {
  it("inserts a record for a step the first time it is touched", () => {
    const next = updateStepProgress([], { todoId: "T1", step: 2, note: "Deck for the board, by Friday." }, now);
    expect(next).toEqual<StepProgress[]>([{ todoId: "T1", step: 2, done: false, note: "Deck for the board, by Friday.", updatedAt: now }]);
  });

  it("merges a patch into an existing record and keeps the others", () => {
    const base = updateStepProgress([], { todoId: "T1", step: 1, note: "a" }, now);
    const withTwo = updateStepProgress(base, { todoId: "T1", step: 2, done: true }, now);
    const later = new Date("2026-10-12T11:00:00Z");
    const next = updateStepProgress(withTwo, { todoId: "T1", step: 1, done: true }, later);
    expect(next).toEqual([
      { todoId: "T1", step: 2, done: true, note: "", updatedAt: now },
      { todoId: "T1", step: 1, done: true, note: "a", updatedAt: later },
    ]);
  });

  it("drops a record that is neither done nor annotated", () => {
    const base = updateStepProgress([], { todoId: "T1", step: 1, note: "draft" }, now);
    expect(updateStepProgress(base, { todoId: "T1", step: 1, note: "   " }, now)).toEqual([]);
  });

  it("trims trailing whitespace but keeps inner line breaks", () => {
    const next = updateStepProgress([], { todoId: "T1", step: 1, note: "line one\nline two  \n" }, now);
    expect(next[0]!.note).toBe("line one\nline two");
  });
});

describe("progressFor", () => {
  it("returns one todo's records ordered by step", () => {
    let all: readonly StepProgress[] = [];
    all = updateStepProgress(all, { todoId: "T2", step: 3, done: true }, now);
    all = updateStepProgress(all, { todoId: "T1", step: 1, note: "x" }, now);
    all = updateStepProgress(all, { todoId: "T2", step: 1, note: "y" }, now);
    expect(progressFor(all, "T2").map((p) => p.step)).toEqual([1, 3]);
  });
});

describe("stepWantsWriting", () => {
  const step = (action: string, detail?: string): ExecutionStep => ({ order: 1, action, ...(detail ? { detail } : {}) });
  it("recognises steps whose output is something written", () => {
    expect(stepWantsWriting(step("Clarify what finishing this produces and for whom.", "One sentence."))).toBe(true);
    expect(stepWantsWriting(step("List the inputs and people you need, and get them."))).toBe(true);
    expect(stepWantsWriting(step("Draft the opening paragraph"))).toBe(true);
    expect(stepWantsWriting(step("Decide which vendor to go with"))).toBe(true);
  });
  it("leaves physical or external steps alone", () => {
    expect(stepWantsWriting(step("Do the work in one focused block.", "Phone away, notifications off."))).toBe(false);
    expect(stepWantsWriting(step("Call the dentist"))).toBe(false);
  });
});
