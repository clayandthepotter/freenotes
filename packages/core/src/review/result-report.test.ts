import { describe, expect, it } from "vitest";
import { createTodo } from "../planning/todo.js";
import { parseResultReport } from "./result-report.js";

const todos = [
  createTodo("T1", 0, { title: "Finish Q4 budget deck" }),
  createTodo("T2", 1, { title: "Call the dentist" }),
  createTodo("T3", 2, { title: "Write launch post" }),
  createTodo("T4", 3, { title: "Book flights" }),
  createTodo("T5", 4, { title: "Review PR #42" }),
];

describe("parseResultReport", () => {
  it("matches by code or title and infers status from the words used", () => {
    const text = `
# What happened this week
T1: done — shipped the deck Thursday night, CFO happy
- T2 partial, got through to reception but no slot yet
- [x] Write launch post — published Tuesday
- Book flights: skipped, waiting on dates from Sam
- Reviewed the PR #42 but blocked on CI
- Random thought that is not a todo
`;
    const { results, unmatchedLines } = parseResultReport(text, todos);
    expect(results).toEqual([
      { todoId: "T1", status: "done", notes: "shipped the deck Thursday night, CFO happy" },
      { todoId: "T2", status: "partial", notes: "got through to reception but no slot yet" },
      { todoId: "T3", status: "done", notes: "published Tuesday" },
      { todoId: "T4", status: "skipped", notes: "waiting on dates from Sam" },
      { todoId: "T5", status: "blocked", notes: expect.stringContaining("CI") },
    ]);
    expect(unmatchedLines).toEqual(["- Random thought that is not a todo"]);
  });

  it("defaults to done for checked boxes and partial otherwise when no status word is present", () => {
    const { results } = parseResultReport("- [x] T1 the deck is out\n- T2 spoke to them", todos);
    expect(results.map((r) => r.status)).toEqual(["done", "partial"]);
  });

  it("merges repeated mentions of the same todo", () => {
    const { results } = parseResultReport("T1: done first draft\nT1 also sent to the board", todos);
    expect(results).toHaveLength(1);
    expect(results[0]!.notes).toContain("first draft");
    expect(results[0]!.notes).toContain("sent to the board");
  });
});
