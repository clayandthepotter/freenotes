import { describe, expect, it } from "vitest";
import { createTodo, emptyWorkspace } from "@freenotes/core";
import { LocalStorageWorkspaceRepository } from "./local-storage-repository.js";

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

describe("LocalStorageWorkspaceRepository", () => {
  it("starts empty, then persists", async () => {
    const storage = memoryStorage();
    const repo = new LocalStorageWorkspaceRepository(storage);
    expect((await repo.load()).todos).toEqual([]);
    await repo.save({ ...emptyWorkspace(), todos: [createTodo("T1", 0, { title: "x" })] });
    expect((await repo.load()).todos[0]!.title).toBe("x");
  });

  it("recovers from a corrupt value by backing it up", async () => {
    const storage = memoryStorage();
    storage.setItem("freenotes.workspace.v1", "{not json");
    const repo = new LocalStorageWorkspaceRepository(storage);
    expect((await repo.load()).todos).toEqual([]);
    expect([...storage.map.keys()].some((k) => k.includes(".corrupt."))).toBe(true);
  });

  it("validates on import", () => {
    const repo = new LocalStorageWorkspaceRepository(memoryStorage());
    expect(() => repo.import('{"version":9}')).toThrow();
    expect(() => repo.import(repo.export() ?? JSON.stringify({ version: 1, compositions: [], todos: [], plans: {}, results: [], reflections: [], settings: { workingHours: { "1": { start: "09:00", end: "17:00" } }, policy: {} } }))).not.toThrow();
  });
});
