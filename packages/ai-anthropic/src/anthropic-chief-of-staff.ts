import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { ChiefOfStaffError } from "@freenotes/core";
import { StructuredChiefOfStaff, SYSTEM_PROMPT } from "@freenotes/ai-structured";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicChiefOfStaffOptions {
  /** Injectable for tests and custom transports. Defaults to `new Anthropic()` (reads ANTHROPIC_API_KEY or an `ant auth login` profile). */
  readonly client?: Anthropic;
  /** Used to build a client when none is injected, e.g. a user's own key. */
  readonly apiKey?: string;
  /** Defaults to claude-opus-5-5. */
  readonly model?: string;
  /** Defaults to "high". */
  readonly effort?: Effort;
  /** Server-side refusal fallbacks (`fallbacks: "default"`). On by default; set false for platforms that reject it. */
  readonly fallbacks?: boolean;
  readonly maxTokens?: number;
}

export { ChiefOfStaffError };

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Claude as chief of staff: one structured-output request per task. */
export class AnthropicChiefOfStaff extends StructuredChiefOfStaff {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: Effort;
  private readonly fallbacks: boolean;
  private readonly maxTokens: number;

  constructor(options: AnthropicChiefOfStaffOptions = {}) {
    super();
    this.client = options.client ?? new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
    this.model = options.model ?? "claude-opus-5-5";
    this.effort = options.effort ?? "high";
    this.fallbacks = options.fallbacks ?? true;
    this.maxTokens = options.maxTokens ?? 16_000;
    this.name = `claude (${this.model})`;
  }

  protected async ask<S extends z.ZodType>(schema: S, _schemaName: string, prompt: string): Promise<z.infer<S>> {
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
        throw new ChiefOfStaffError("api", "Anthropic rejected the API key. Check the key in Settings, or set ANTHROPIC_API_KEY on the server.", error);
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
