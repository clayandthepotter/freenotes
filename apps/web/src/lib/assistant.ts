import { HeuristicChiefOfStaff, type ChiefOfStaff } from "@freenotes/core";
import { HttpChiefOfStaff } from "@freenotes/ai-http";

export type AssistantMode = "auto" | "server" | "heuristic";

export interface ResolvedAssistant {
  readonly chiefOfStaff: ChiefOfStaff;
  readonly label: string;
  readonly online: boolean;
}

/**
 * Prefer the server-backed chief of staff (Claude, with the API key safely server-side);
 * fall back to the in-browser heuristic when no server answers.
 */
export async function resolveAssistant(mode: AssistantMode): Promise<ResolvedAssistant> {
  if (mode === "heuristic") return { chiefOfStaff: new HeuristicChiefOfStaff(), label: "heuristic (offline)", online: false };
  const remote = new HttpChiefOfStaff({ baseUrl: "" });
  const status = await remote.status();
  if (status.available) return { chiefOfStaff: remote, label: status.name ?? "server", online: true };
  if (mode === "server") throw new Error("The freenotes server is not reachable. Start it with `pnpm --filter @freenotes/server start`.");
  return { chiefOfStaff: new HeuristicChiefOfStaff(), label: "heuristic (no server found)", online: false };
}
