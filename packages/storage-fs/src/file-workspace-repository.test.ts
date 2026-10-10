import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodo, emptyWorkspace } from "@freenotes/core";
import { FileWorkspaceRepository } from "./file-workspace-repository.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "freenotes-"));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("FileWorkspaceRepository", () => {
  it("returns an empty workspace when the file does not exist", async () => {
    const repo = new FileWorkspaceRepository(join(dir, "nested", "workspace.json"));
    expect((await repo.load()).todos).toEqual([]);
  });

  it("saves and loads, creating parent directories", async () => {
    const path = join(dir, "nested", "workspace.json");
    const repo = new FileWorkspaceRepository(path);
    const ws = { ...emptyWorkspace(), todos: [createTodo("T1", 0, { title: "hello" })] };
    await repo.save(ws);
    expect(JSON.parse(await readFile(path, "utf8")).todos[0].title).toBe("hello");
    expect((await repo.load()).todos[0]!.title).toBe("hello");
  });
});
