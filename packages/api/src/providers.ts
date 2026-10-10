import type { ChiefOfStaff } from "@freenotes/core";
import { ChiefOfStaffError } from "@freenotes/core";
import { AnthropicChiefOfStaff } from "@freenotes/ai-anthropic";
import { OpenAiCompatibleChiefOfStaff } from "@freenotes/ai-openai";

export interface ProviderConfig {
  readonly apiKey?: string;
  readonly model?: string;
  readonly baseUrl?: string;
}

/** What the UI needs to render a provider choice. Safe to send to the browser. */
export interface ProviderView {
  readonly id: string;
  readonly label: string;
  readonly defaultModel: string;
  readonly suggestedModels: readonly string[];
  readonly needsApiKey: boolean;
  readonly supportsBaseUrl: boolean;
  readonly defaultBaseUrl?: string;
  readonly note?: string;
}

export interface ProviderDefinition extends ProviderView {
  create(config: ProviderConfig): ChiefOfStaff;
}

export const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    defaultModel: "claude-opus-5-5",
    suggestedModels: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
    needsApiKey: true,
    supportsBaseUrl: false,
    create: (c) => new AnthropicChiefOfStaff({ ...(c.apiKey ? { apiKey: c.apiKey } : {}), model: c.model || "claude-opus-5-5" }),
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-5",
    suggestedModels: ["gpt-5", "gpt-5-mini"],
    needsApiKey: true,
    supportsBaseUrl: false,
    create: (c) => new OpenAiCompatibleChiefOfStaff({ ...(c.apiKey ? { apiKey: c.apiKey } : {}), model: c.model || "gpt-5", label: "openai" }),
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible (Groq, Mistral, OpenRouter, Ollama, …)",
    defaultModel: "",
    suggestedModels: [],
    needsApiKey: false,
    supportsBaseUrl: true,
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    note: "Local servers such as Ollama (http://localhost:11434/v1) only work when the freenotes server runs on the same machine.",
    create: (c) => {
      if (!c.baseUrl) throw new ChiefOfStaffError("config", "An OpenAI-compatible provider needs a base URL.");
      if (!c.model) throw new ChiefOfStaffError("config", "An OpenAI-compatible provider needs a model id.");
      return new OpenAiCompatibleChiefOfStaff({ ...(c.apiKey ? { apiKey: c.apiKey } : {}), baseUrl: c.baseUrl, model: c.model });
    },
  },
];

export function findProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function providerViews(): ProviderView[] {
  return PROVIDERS.map(({ create: _create, ...view }) => view);
}

export function createProviderChiefOfStaff(id: string, config: ProviderConfig): ChiefOfStaff {
  const provider = findProvider(id);
  if (!provider) throw new ChiefOfStaffError("config", `Unknown provider "${id}".`);
  if (provider.needsApiKey && !config.apiKey) throw new ChiefOfStaffError("config", `${provider.label} needs an API key. Add one in Settings.`);
  return provider.create(config);
}
