import { HeuristicChiefOfStaff, type ChiefOfStaff } from "@freenotes/core";
import { HttpChiefOfStaff, type StatusResponse } from "@freenotes/ai-http";

export type AssistantMode = "auto" | "server" | "heuristic";

export interface ResolvedAssistant {
  readonly chiefOfStaff: ChiefOfStaff;
  readonly label: string;
  readonly online: boolean;
  /** The server-side API client, present whenever the server answered. */
  readonly api?: HttpChiefOfStaff;
  readonly status?: StatusResponse;
}

/**
 * Prefer the server-backed chief of staff (the operator's or, when signed in, the user's own provider);
 * fall back to the in-browser heuristic when no server answers.
 */
export async function resolveAssistant(mode: AssistantMode, getToken: () => Promise<string | null>): Promise<ResolvedAssistant> {
  if (mode === "heuristic") return { chiefOfStaff: new HeuristicChiefOfStaff(), label: "heuristic (offline)", online: false };
  const remote = new HttpChiefOfStaff({ baseUrl: "", getToken });
  const status = await remote.status();
  if (status.available) {
    const label = status.provider && status.provider !== "default" ? `${status.name} · your key` : (status.name ?? "server");
    return { chiefOfStaff: remote, label, online: true, api: remote, status };
  }
  if (mode === "server") throw new Error("The freenotes server is not reachable. Start it with `pnpm --filter @freenotes/server start`.");
  return { chiefOfStaff: new HeuristicChiefOfStaff(), label: "heuristic (no server found)", online: false };
}
