import type { SupabaseClient } from "@supabase/supabase-js";
import { deserializeWorkspace, emptyWorkspace, serializeWorkspace, type Workspace, type WorkspaceRepository, type WorkspaceSnapshot } from "@freenotes/core";

export class WorkspaceConflictError extends Error {
  constructor() {
    super("Your workspace changed somewhere else since it was loaded here. Reload to pick up the latest version.");
    this.name = "WorkspaceConflictError";
  }
}

interface Row {
  snapshot: WorkspaceSnapshot;
  revision: number;
}

/**
 * The user's workspace in `public.workspaces`, one row per (user, name).
 * Loads and saves the whole snapshot; `revision` gives optimistic concurrency across devices.
 * Works with a browser client (session-authenticated) or a user-scoped server client.
 */
export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  private revision: number | undefined;

  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    private readonly name = "default",
  ) {}

  async load(): Promise<Workspace> {
    const { data, error } = await this.client
      .from("workspaces")
      .select("snapshot, revision")
      .eq("user_id", this.userId)
      .eq("name", this.name)
      .maybeSingle<Row>();
    if (error) throw new Error(`Could not load workspace: ${error.message}`);
    if (!data) {
      this.revision = undefined;
      return emptyWorkspace();
    }
    this.revision = data.revision;
    return deserializeWorkspace(data.snapshot);
  }

  async save(workspace: Workspace): Promise<void> {
    const snapshot = serializeWorkspace(workspace);
    if (this.revision === undefined) {
      const { data, error } = await this.client
        .from("workspaces")
        .insert({ user_id: this.userId, name: this.name, snapshot, revision: 1 })
        .select("revision")
        .single<{ revision: number }>();
      if (error) {
        if (error.code === "23505") throw new WorkspaceConflictError(); // someone created it meanwhile
        throw new Error(`Could not save workspace: ${error.message}`);
      }
      this.revision = data.revision;
      return;
    }
    const next = this.revision + 1;
    const { data, error } = await this.client
      .from("workspaces")
      .update({ snapshot, revision: next })
      .eq("user_id", this.userId)
      .eq("name", this.name)
      .eq("revision", this.revision)
      .select("revision");
    if (error) throw new Error(`Could not save workspace: ${error.message}`);
    if (!data || data.length === 0) throw new WorkspaceConflictError();
    this.revision = next;
  }

  /** True when nothing has been saved for this user yet (useful for offering a local → cloud import). */
  async isEmpty(): Promise<boolean> {
    const { count, error } = await this.client.from("workspaces").select("id", { count: "exact", head: true }).eq("user_id", this.userId).eq("name", this.name);
    if (error) throw new Error(`Could not check workspace: ${error.message}`);
    return (count ?? 0) === 0;
  }
}
