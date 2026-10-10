import type { WorkspaceRepository } from "../../ports/workspace-repository.js";
import { deserializeWorkspace, serializeWorkspace } from "../../workspace/codec.js";
import { emptyWorkspace, type Workspace } from "../../workspace/workspace.js";

/** Keeps the workspace in memory; round-trips through the codec so tests exercise serialization. */
export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private snapshot: string | undefined;

  constructor(initial?: Workspace) {
    if (initial) this.snapshot = JSON.stringify(serializeWorkspace(initial));
  }

  async load(): Promise<Workspace> {
    return this.snapshot ? deserializeWorkspace(JSON.parse(this.snapshot)) : emptyWorkspace();
  }

  async save(workspace: Workspace): Promise<void> {
    this.snapshot = JSON.stringify(serializeWorkspace(workspace));
  }
}
