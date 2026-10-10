import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { ChiefOfStaffError } from "@freenotes/core";
import { StructuredChiefOfStaff, SYSTEM_PROMPT } from "@freenotes/ai-structured";

export interface OpenAiCompatibleOptions {
  /** Injectable for tests. */
  readonly client?: OpenAI;
  readonly apiKey?: string;
  /** Any OpenAI-compatible endpoint: OpenAI itself when omitted, or Groq, Mistral, OpenRouter, Ollama (`http://localhost:11434/v1`), … */
  readonly baseUrl?: string;
  readonly model: string;
  /** Shown in the UI; defaults to the host of baseUrl or "openai". */
  readonly label?: string;
}

/**
 * Chief of staff over the OpenAI chat-completions API with JSON-schema structured outputs.
 * Works with every provider that speaks that API; strict schema support varies by provider,
 * so answers are validated with zod before they reach the domain.
 */
export class OpenAiCompatibleChiefOfStaff extends StructuredChiefOfStaff {
  readonly name: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAiCompatibleOptions) {
    super();
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey ?? "none", // local servers such as Ollama accept any key
        ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
      });
    this.model = options.model;
    const label = options.label ?? (options.baseUrl ? safeHost(options.baseUrl) : "openai");
    this.name = `${label} (${this.model})`;
  }

  protected async ask<S extends z.ZodType>(schema: S, schemaName: string, prompt: string): Promise<z.infer<S>> {
    let completion;
    try {
      completion = await this.client.chat.completions.parse({
        model: this.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        response_format: zodResponseFormat(schema, schemaName),
      });
    } catch (error) {
      if (error instanceof OpenAI.AuthenticationError) {
        throw new ChiefOfStaffError("api", "The provider rejected the API key. Check the key in Settings.", error);
      }
      if (error instanceof OpenAI.RateLimitError) {
        throw new ChiefOfStaffError("api", "Provider rate limit hit. Try again in a moment.", error);
      }
      if (error instanceof OpenAI.NotFoundError) {
        throw new ChiefOfStaffError("api", `The provider does not know model "${this.model}". Check the model id in Settings.`, error);
      }
      if (error instanceof OpenAI.APIError) {
        throw new ChiefOfStaffError("api", `Provider API error ${error.status ?? ""}: ${error.message}`, error);
      }
      throw error;
    }

    const message = completion.choices[0]?.message;
    if (!message) throw new ChiefOfStaffError("unparseable", "The provider returned no choices.");
    if (message.refusal) throw new ChiefOfStaffError("refusal", `The model declined this request (${message.refusal}).`);
    if (completion.choices[0]?.finish_reason === "length") {
      throw new ChiefOfStaffError("unparseable", "The model ran out of output tokens before finishing.");
    }
    if (!message.parsed) {
      // Providers without strict mode may still return valid JSON as text; try once more by hand.
      const parsed = schema.safeParse(tryJson(message.content));
      if (parsed.success) return parsed.data as z.infer<S>;
      throw new ChiefOfStaffError("unparseable", "The model's answer did not match the expected structure.");
    }
    return message.parsed as z.infer<S>;
  }
}

function tryJson(text: string | null | undefined): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return undefined;
    try {
      return JSON.parse(m[0]);
    } catch {
      return undefined;
    }
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
