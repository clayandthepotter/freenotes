import type { Workspace } from "../workspace/workspace.js";

export interface WorkspaceRepository {
  load(): Promise<Workspace>;
  save(workspace: Workspace): Promise<void>;
}
