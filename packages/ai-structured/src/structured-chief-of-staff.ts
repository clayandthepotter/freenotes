import type { z } from "zod";
import {
  orderAchievements,
  type AchievementReport,
  type ChiefOfStaff,
  type ComposeReportRequest,
  type ExecutionPlan,
  type PlanExecutionRequest,
  type RefineTodosRequest,
  type TodoRefinement,
} from "@freenotes/core";
import { composeReportPrompt, planExecutionPrompt, refineTodosPrompt } from "./prompts.js";
import { AchievementReportSchema, ExecutionPlanSchema, RefinementsSchema } from "./schemas.js";

/**
 * Everything a model-backed chief of staff does except talking to the model.
 * Providers implement `ask`: send the prompt, return an object matching the schema.
 * The domain validators in @freenotes/core remain the last line of defence.
 */
export abstract class StructuredChiefOfStaff implements ChiefOfStaff {
  abstract readonly name: string;

  protected abstract ask<S extends z.ZodType>(schema: S, schemaName: string, prompt: string): Promise<z.infer<S>>;

  async refineTodos(request: RefineTodosRequest): Promise<readonly TodoRefinement[]> {
    const out = await this.ask(RefinementsSchema, "refinements", refineTodosPrompt(request));
    const known = new Set(request.todos.map((t) => t.id));
    return out.refinements
      .filter((r) => known.has(r.todoId))
      .map((r) => ({
        todoId: r.todoId,
        ...(r.estimatedMinutes && r.estimatedMinutes > 0 ? { estimatedMinutes: r.estimatedMinutes } : {}),
        ...(r.priority ? { priority: r.priority } : {}),
        ...(r.clarifiedTitle?.trim() ? { clarifiedTitle: r.clarifiedTitle.trim() } : {}),
        rationale: r.rationale,
      }));
  }

  async planExecution(request: PlanExecutionRequest): Promise<ExecutionPlan> {
    const out = await this.ask(ExecutionPlanSchema, "execution_plan", planExecutionPrompt(request));
    return {
      todoId: request.todo.id,
      objective: out.objective,
      definitionOfDone: out.definitionOfDone,
      steps: out.steps.map((s, i) => ({
        order: i + 1,
        action: s.action,
        ...(s.detail ? { detail: s.detail } : {}),
        ...(s.estimatedMinutes && s.estimatedMinutes > 0 ? { estimatedMinutes: s.estimatedMinutes } : {}),
      })),
      inputs: out.inputs,
      risks: out.risks,
      firstAction: out.firstAction || out.steps[0]?.action || "",
      source: "assistant",
    };
  }

  async composeAchievementReport(request: ComposeReportRequest): Promise<AchievementReport> {
    const out = await this.ask(AchievementReportSchema, "achievement_report", composeReportPrompt(request));
    const byId = new Map(request.todos.map((t) => [t.id, t] as const));
    const completed = request.results.filter((r) => r.status === "done").map((r) => r.todoId);

    const achievements = out.achievements.filter((a) => byId.has(a.todoId)).map((a) => ({ ...a, title: byId.get(a.todoId)!.title }));

    // Guarantee the contract "one question per completed todo" even if the model dropped one.
    const asked = new Map(out.reflections.filter((r) => byId.has(r.todoId)).map((r) => [r.todoId, r] as const));
    const reflections = completed.map((id) => {
      const r = asked.get(id);
      const question = r?.question.trim() ?? `What did completing "${byId.get(id)!.title}" teach you?`;
      return { todoId: id, question: question.endsWith("?") ? question : `${question}?` };
    });

    return {
      headline: out.headline,
      achievements: orderAchievements(achievements),
      improvements: out.improvements.map((i) => ({ ...i, relatedTodoIds: i.relatedTodoIds.filter((id) => byId.has(id)) })),
      reflections,
      source: "assistant",
    };
  }
}
