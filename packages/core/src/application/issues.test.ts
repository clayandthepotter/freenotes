import { describe, expect, it } from "vitest";
import { HeuristicChiefOfStaff } from "../adapters/heuristic/heuristic-chief-of-staff.js";
import { InMemoryWorkspaceRepository } from "../adapters/memory/in-memory-workspace-repository.js";
import type { ExternalIssue } from "../issues/issue.js";
import { fixedClock } from "../shared/clock.js";
import { sequentialIdGenerator } from "../shared/ids.js";
import { LocalDate } from "../shared/local-date.js";
import { deserializeWorkspace, serializeWorkspace } from "../workspace/codec.js";
import { Freenotes } from "./freenotes.js";

const issue = (over: Partial<ExternalIssue>): ExternalIssue => ({ source: "linear", id: "i1", identifier: "ENG-1", title: "Fix login", url: "https://linear.app/x/ENG-1", state: "todo", priority: 3, ...over });

function app(issues: () => readonly ExternalIssue[]) {
  return new Freenotes({
    repository: new InMemoryWorkspaceRepository(),
    chiefOfStaff: new HeuristicChiefOfStaff(),
    clock: fixedClock(new Date(2026, 9, 12, 9, 0)),
    ids: sequentialIdGenerator("c"),
    issues: { name: "linear", assignedToMe: async () => issues() },
  });
}

describe("importIssues", () => {
  it("mirrors open issues as todos after whatever was captured, with due dates, estimates and priority", async () => {
    const fn = app(() => [
      issue({}),
      issue({ id: "i2", identifier: "ENG-2", title: "Write release notes", url: "https://linear.app/x/ENG-2", dueDate: LocalDate.parse("2026-10-16"), estimatePoints: 2, priority: 1, project: "Launch" }),
      issue({ id: "i3", identifier: "ENG-3", title: "Already shipped", state: "done" }),
    ]);
    await fn.braindump({ text: "- Call the dentist", refine: false });
    const out = await fn.importIssues();
    expect(out.seen).toBe(3);
    expect(out.added.map((t) => t.id)).toEqual(["T2", "T3"]);
    expect(out.added[1]).toMatchObject({ title: "ENG-2 Write release notes", priority: "high", estimatedMinutes: 120, estimateSource: "explicit", external: { source: "linear", id: "i2", identifier: "ENG-2" } });
    expect(out.added[1]!.deadline?.date.toString()).toBe("2026-10-16");
    expect(out.added[1]!.notes).toContain("Project: Launch");
    expect(out.added[0]).toMatchObject({ estimateSource: "default" });
    expect(out.composition?.kind).toBe("braindump");
    expect(out.composition?.title).toMatch(/Imported from linear/);

    const ws = await fn.workspace();
    expect(ws.todos).toHaveLength(3);
    const back = deserializeWorkspace(JSON.parse(JSON.stringify(serializeWorkspace(ws))));
    expect(back.todos[2]!.external).toEqual({ source: "linear", id: "i2", identifier: "ENG-2", url: "https://linear.app/x/ENG-2" });
  });

  it("is idempotent and closes todos whose issues were completed or cancelled", async () => {
    let state: readonly ExternalIssue[] = [issue({}), issue({ id: "i2", identifier: "ENG-2", title: "B" })];
    const fn = app(() => state);
    await fn.importIssues();
    const again = await fn.importIssues();
    expect(again.added).toEqual([]);
    expect(again.closed).toEqual([]);
    expect(again.composition).toBeUndefined();

    state = [issue({ state: "done" }), issue({ id: "i2", identifier: "ENG-2", title: "B", state: "cancelled" })];
    const closed = await fn.importIssues();
    expect(closed.closed).toEqual(["T1", "T2"]);
    const ws = await fn.workspace();
    expect(ws.results).toEqual([
      { todoId: "T1", status: "done", notes: "ENG-1 completed in linear" },
      { todoId: "T2", status: "skipped", notes: "ENG-2 cancelled in linear" },
    ]);
    const third = await fn.importIssues();
    expect(third.closed).toEqual([]); // already recorded
  });

  it("explains when no tracker is connected", async () => {
    const fn = new Freenotes({ repository: new InMemoryWorkspaceRepository(), chiefOfStaff: new HeuristicChiefOfStaff() });
    await expect(fn.importIssues()).rejects.toThrow(/No issue tracker/);
  });
});
