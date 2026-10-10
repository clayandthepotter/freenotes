import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { deserializeWorkspace, emptyWorkspace, serializeWorkspace, type Workspace, type WorkspaceRepository } from "@freenotes/core";

/**
 * Stores the whole workspace as one pretty-printed JSON file, written atomically
 * (temp file + rename) so a crash mid-write never corrupts it. Git-friendly by design.
 */
export class FileWorkspaceRepository implements WorkspaceRepository {
  constructor(readonly path: string) {}

  async load(): Promise<Workspace> {
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyWorkspace();
      throw error;
    }
    return deserializeWorkspace(JSON.parse(raw));
  }

  async save(workspace: Workspace): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(serializeWorkspace(workspace), null, 2) + "\n", "utf8");
    await rename(tmp, this.path);
  }
}
