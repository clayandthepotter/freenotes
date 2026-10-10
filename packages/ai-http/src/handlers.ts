import type { ChiefOfStaff } from "@freenotes/core";
import { planCodec, refineCodec, reportCodec, type PlanResponse, type PlanWire, type RefineResponse, type RefineWire, type ReportResponse, type ReportWire } from "./protocol.js";

/**
 * Framework-agnostic handlers: decode the wire request, call the chief of staff, return JSON.
 * Mount them in Hono, Express, Cloudflare Workers, … with a few lines each.
 */
export function createChiefOfStaffHandlers(chiefOfStaff: ChiefOfStaff) {
  return {
    status: (): { available: boolean; name: string } => ({ available: true, name: chiefOfStaff.name }),
    refine: async (body: RefineWire): Promise<RefineResponse> => ({
      refinements: [...(await chiefOfStaff.refineTodos(refineCodec.decode(body)))],
    }),
    plan: async (body: PlanWire): Promise<PlanResponse> => ({ plan: await chiefOfStaff.planExecution(planCodec.decode(body)) }),
    report: async (body: ReportWire): Promise<ReportResponse> => ({ report: await chiefOfStaff.composeAchievementReport(reportCodec.decode(body)) }),
  };
}

export type ChiefOfStaffHandlers = ReturnType<typeof createChiefOfStaffHandlers>;
