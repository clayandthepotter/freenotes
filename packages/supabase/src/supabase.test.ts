import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createTodo, emptyWorkspace } from "@freenotes/core";
import { FakeSupabase } from "./fake-supabase.js";
import { SupabaseUserSettingsRepository } from "./user-settings-repository.js";
import { SupabaseWorkspaceRepository, WorkspaceConflictError } from "./workspace-repository.js";

const asClient = (fake: FakeSupabase) => fake as unknown as SupabaseClient;
const ctx = { user: { id: "u-ada" }, token: "jwt" };

describe("SupabaseWorkspaceRepository", () => {
  it("starts empty, inserts on first save, then updates with a revision check", async () => {
    const fake = new FakeSupabase();
    const repo = new SupabaseWorkspaceRepository(asClient(fake), "u-ada");
    expect(await repo.isEmpty()).toBe(true);
    expect((await repo.load()).todos).toEqual([]);

    await repo.save({ ...emptyWorkspace(), todos: [createTodo("T1", 0, { title: "a" })] });
    expect(fake.tables.get("workspaces")![0]).toMatchObject({ user_id: "u-ada", name: "default", revision: 1 });

    await repo.save({ ...emptyWorkspace(), todos: [createTodo("T1", 0, { title: "a" }), createTodo("T2", 1, { title: "b" })] });
    expect(fake.tables.get("workspaces")![0]).toMatchObject({ revision: 2 });
    expect(await repo.isEmpty()).toBe(false);

    const again = new SupabaseWorkspaceRepository(asClient(fake), "u-ada");
    expect((await again.load()).todos.map((t) => t.id)).toEqual(["T1", "T2"]);
  });

  it("detects a concurrent edit from another device", async () => {
    const fake = new FakeSupabase();
    const here = new SupabaseWorkspaceRepository(asClient(fake), "u-ada");
    const there = new SupabaseWorkspaceRepository(asClient(fake), "u-ada");
    await here.save(emptyWorkspace());
    await here.load();
    await there.load();
    await there.save({ ...emptyWorkspace(), todos: [createTodo("T1", 0, { title: "from there" })] });
    await expect(here.save(emptyWorkspace())).rejects.toBeInstanceOf(WorkspaceConflictError);
    await here.load(); // picking up the new revision resolves it
    await expect(here.save(emptyWorkspace())).resolves.toBeUndefined();
  });

  it("keeps users apart", async () => {
    const fake = new FakeSupabase();
    await new SupabaseWorkspaceRepository(asClient(fake), "u-ada").save(emptyWorkspace());
    expect(await new SupabaseWorkspaceRepository(asClient(fake), "u-bob").isEmpty()).toBe(true);
  });
});

describe("SupabaseUserSettingsRepository", () => {
  it("round-trips settings through the row shape", async () => {
    const fake = new FakeSupabase();
    const repo = new SupabaseUserSettingsRepository({ url: "x", publishableKey: "y" }, () => asClient(fake));
    expect(await repo.get(ctx)).toBeNull();
    await repo.save(ctx, { profile: "PM", provider: "anthropic", model: "claude-opus-5-5", apiKeyCiphertext: "v1.a.b", apiKeyLast4: "1234" });
    expect(await repo.get(ctx)).toMatchObject({ profile: "PM", provider: "anthropic", model: "claude-opus-5-5", apiKeyCiphertext: "v1.a.b", apiKeyLast4: "1234" });
    await repo.save(ctx, { profile: "PM", provider: "default" });
    const back = await repo.get(ctx);
    expect(back).toMatchObject({ provider: "default" });
    expect(back).not.toHaveProperty("apiKeyCiphertext");
  });
});
