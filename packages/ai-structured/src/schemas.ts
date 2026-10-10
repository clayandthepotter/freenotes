import { z } from "zod";

/**
 * Structured-output schemas for the three chief-of-staff tasks.
 * Every field is required (nullable rather than optional) so the schema is strict-friendly.
 */
export const RefinementsSchema = z.object({
  refinements: z.array(
    z.object({
      todoId: z.string(),
      estimatedMinutes: z.number().int().nullable(),
      priority: z.enum(["high", "normal", "low"]).nullable(),
      clarifiedTitle: z.string().nullable(),
      rationale: z.string(),
    }),
  ),
});

export const ExecutionPlanSchema = z.object({
  objective: z.string(),
  definitionOfDone: z.array(z.string()),
  steps: z.array(
    z.object({
      action: z.string(),
      detail: z.string().nullable(),
      estimatedMinutes: z.number().int().nullable(),
    }),
  ),
  inputs: z.array(z.string()),
  risks: z.array(z.string()),
  firstAction: z.string(),
});

export const AchievementReportSchema = z.object({
  headline: z.string(),
  achievements: z.array(
    z.object({
      todoId: z.string(),
      summary: z.string(),
      significance: z.enum(["major", "solid", "minor"]),
      onTime: z.boolean().nullable(),
    }),
  ),
  improvements: z.array(
    z.object({
      theme: z.string(),
      observation: z.string(),
      suggestion: z.string(),
      relatedTodoIds: z.array(z.string()),
    }),
  ),
  reflections: z.array(
    z.object({
      todoId: z.string(),
      question: z.string(),
    }),
  ),
});

export type RefinementsOutput = z.infer<typeof RefinementsSchema>;
export type ExecutionPlanOutput = z.infer<typeof ExecutionPlanSchema>;
export type AchievementReportOutput = z.infer<typeof AchievementReportSchema>;
