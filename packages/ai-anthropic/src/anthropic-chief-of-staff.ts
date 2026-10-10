import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
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
import { composeReportPrompt, planExecutionPrompt, refineTodosPrompt, SYSTEM_PROMPT } from "./prompts.js";
import { AchievementReportSchema, ExecutionPlanSchema, RefinementsSchema } from "./schemas.js";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicChiefOfStaffOptions {
  /** Injectable for tests and custom transports. Defaults to `new Anthropic()` (reads ANTHROPIC_API_KEY or an `ant auth login` profile). */
  readonly client?: Anthropic;
  /** Defaults to claude-opus-5-5. */
  readonly model?: string;
  /** Defaults to "high". */
  readonly effort?: Effort;
  /** Server-side refusal fallbacks (`fallbacks: "default"`). On by default; set false for platforms that reject it. */
  readonly fallbacks?: boolean;
  readonly maxTokens?: number;
}

export class ChiefOfStaffError extends Error {
  constructor(
    readonly code: "refusal" | "unparseable" | "api",
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ChiefOfStaffError";
  }
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Claude as chief of staff. Each task is one structured-output request; the domain validators
 * in @freenotes/core are the last line of defence against a malformed answer.
 */
export class AnthropicChiefOfStaff implements ChiefOfStaff {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: Effort;
  private readonly fallbacks: boolean;
  private readonly maxTokens: number;

  constructor(options: AnthropicChiefOfStaffOptions = {}) {
    this.client = options.client ?? new Anthropic();
    this.model = options.model ?? "claude-opus-5-5";
    this.effort = options.effort ?? "high";
    this.fallbacks = options.fallbacks ?? true;
    this.maxTokens = options.maxTokens ?? 16_000;
    this.name = `claude (${this.model})`;
  }

  async refineTodos(request: RefineTodosRequest): Promise<readonly TodoRefinement[]> {
    const out = await this.ask(RefinementsSchema, refineTodosPrompt(request));
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
    const out = await this.ask(ExecutionPlanSchema, planExecutionPrompt(request));
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
    const out = await this.ask(AchievementReportSchema, composeReportPrompt(request));
    const byId = new Map(request.todos.map((t) => [t.id, t] as const));
    const completed = request.results.filter((r) => r.status === "done").map((r) => r.todoId);

    const achievements = out.achievements
      .filter((a) => byId.has(a.todoId))
      .map((a) => ({ ...a, title: byId.get(a.todoId)!.title }));

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

  private async ask<S extends z.ZodType>(schema: S, prompt: string): Promise<z.infer<S>> {
    let response;
    try {
      response = await this.client.beta.messages.parse({
        model: this.model,
        max_tokens: this.maxTokens,
        ...(this.fallbacks ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        output_config: { effort: this.effort, format: betaZodOutputFormat(schema) },
        messages: [{ role: "user", content: prompt }],
      });
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new ChiefOfStaffError("api", "Anthropic rejected the API key. Set ANTHROPIC_API_KEY or run `ant auth login`.", error);
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new ChiefOfStaffError("api", "Anthropic rate limit hit. Try again in a moment.", error);
      }
      if (error instanceof Anthropic.APIError) {
        throw new ChiefOfStaffError("api", `Anthropic API error ${error.status ?? ""}: ${error.message}`, error);
      }
      throw error;
    }

    if (response.stop_reason === "refusal") {
      const why = response.stop_details && "explanation" in response.stop_details ? ` (${String(response.stop_details.explanation)})` : "";
      throw new ChiefOfStaffError("refusal", `The model declined this request${why}.`);
    }
    if (response.stop_reason === "max_tokens") {
      throw new ChiefOfStaffError("unparseable", "The model ran out of output tokens before finishing. Raise maxTokens.");
    }
    if (!response.parsed_output) {
      throw new ChiefOfStaffError("unparseable", "The model's answer did not match the expected structure.");
    }
    return response.parsed_output as z.infer<S>;
  }
}
