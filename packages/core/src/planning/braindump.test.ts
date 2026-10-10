import { describe, expect, it } from "vitest";
import { LocalDate } from "../shared/local-date.js";
import { parseBraindump, parseDuration } from "./braindump.js";

const today = LocalDate.parse("2026-10-10"); // Saturday

describe("parseBraindump", () => {
  it("extracts titles, deadlines, durations and priorities from bullets", () => {
    const text = `
# Things on my plate
- Finish Q4 budget deck by Friday ~2h
- [high] Call the dentist
* Write launch post due Oct 20 (1h30m)
1. Book flights !low
- Review PR #42 by tomorrow 3pm
- [ ] Renew passport before end of month
`;
    const { todos, ignoredLines } = parseBraindump(text, { today });

    expect(ignoredLines).toEqual(["# Things on my plate"]);
    expect(todos.map((t) => t.id)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6"]);

    expect(todos[0]).toMatchObject({
      title: "Finish Q4 budget deck",
      estimatedMinutes: 120,
      estimateSource: "explicit",
      priority: "normal",
    });
    expect(todos[0]!.deadline?.date.toString()).toBe("2026-10-16");
    expect(todos[0]!.deadline?.time).toBeUndefined();

    expect(todos[1]).toMatchObject({ title: "Call the dentist", priority: "high", estimatedMinutes: 30, estimateSource: "default" });
    expect(todos[1]!.deadline).toBeUndefined();

    expect(todos[2]).toMatchObject({ title: "Write launch post", estimatedMinutes: 90 });
    expect(todos[2]!.deadline?.date.toString()).toBe("2026-10-20");

    expect(todos[3]).toMatchObject({ title: "Book flights", priority: "low" });

    expect(todos[4]!.title).toBe("Review PR #42");
    expect(todos[4]!.deadline?.date.toString()).toBe("2026-10-11");
    expect(todos[4]!.deadline?.time?.toString()).toBe("15:00");

    expect(todos[5]!.title).toBe("Renew passport");
    expect(todos[5]!.deadline?.date.toString()).toBe("2026-10-31");
  });

  it("treats short unbulleted lines as items but keeps prose and headings aside", () => {
    const { todos, ignoredLines } = parseBraindump(
      "Call mom\nThis is a long sentence. It has two parts and is clearly prose, not a todo.\nIdeas:\n",
      { today },
    );
    expect(todos.map((t) => t.title)).toEqual(["Call mom"]);
    expect(ignoredLines).toHaveLength(2);
  });

  it("does not treat words like 'by' inside the title as deadlines when nothing date-like follows", () => {
    const { todos } = parseBraindump("- Read the book by Kahneman", { today });
    expect(todos[0]!.title).toBe("Read the book by Kahneman");
    expect(todos[0]!.deadline).toBeUndefined();
  });

  it("continues numbering from startAt", () => {
    const { todos } = parseBraindump("- a\n- b", { today, startAt: 7 });
    expect(todos.map((t) => t.id)).toEqual(["T7", "T8"]);
  });

  it("keeps the braindump order as the todo order", () => {
    const { todos } = parseBraindump("- a\n- b\n- c", { today });
    expect(todos.map((t) => t.order)).toEqual([0, 1, 2]);
  });
});

describe("parseDuration", () => {
  it("understands hours, minutes and combinations", () => {
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("1.5 hours")).toBe(90);
    expect(parseDuration("45 min")).toBe(45);
    expect(parseDuration("1h30m")).toBe(90);
    expect(parseDuration("nothing")).toBeUndefined();
  });
});
