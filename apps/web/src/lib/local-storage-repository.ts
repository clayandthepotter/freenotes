import { deserializeWorkspace, emptyWorkspace, serializeWorkspace, type Workspace, type WorkspaceRepository } from "@freenotes/core";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Local-first: the whole workspace lives in the browser. Nothing leaves the device except chief-of-staff requests. */
export class LocalStorageWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key = "freenotes.workspace.v1",
  ) {}

  async load(): Promise<Workspace> {
    const raw = this.storage.getItem(this.key);
    if (!raw) return emptyWorkspace();
    try {
      return deserializeWorkspace(JSON.parse(raw));
    } catch (error) {
      console.error("Could not read the stored workspace; starting fresh. The raw value is kept under a backup key.", error);
      this.storage.setItem(`${this.key}.corrupt.${Date.now()}`, raw);
      return emptyWorkspace();
    }
  }

  async save(workspace: Workspace): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify(serializeWorkspace(workspace)));
  }

  export(): string | null {
    return this.storage.getItem(this.key);
  }

  import(json: string): void {
    deserializeWorkspace(JSON.parse(json)); // validate before overwriting
    this.storage.setItem(this.key, json);
  }
}
