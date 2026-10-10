import { HeuristicChiefOfStaff, type ChiefOfStaff } from "@freenotes/core";
import { AnthropicChiefOfStaff, type Effort } from "@freenotes/ai-anthropic";

export type Env = Readonly<Record<string, string | undefined>>;

/**
 * Picks the chief of staff from environment variables, the same way in every runtime:
 * FREENOTES_AI=auto|claude|heuristic (auto → Claude when credentials exist), FREENOTES_MODEL,
 * FREENOTES_EFFORT, FREENOTES_FALLBACKS=false.
 */
export function chiefOfStaffFromEnv(env: Env, log: (message: string) => void = () => {}): ChiefOfStaff {
  const mode = env.FREENOTES_AI ?? "auto";
  const hasCredentials = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  if (mode === "heuristic" || (mode === "auto" && !hasCredentials)) {
    if (mode === "auto") log("No ANTHROPIC_API_KEY found; serving the heuristic chief of staff.");
    return new HeuristicChiefOfStaff();
  }
  return new AnthropicChiefOfStaff({
    ...(env.FREENOTES_MODEL ? { model: env.FREENOTES_MODEL } : {}),
    ...(env.FREENOTES_EFFORT ? { effort: env.FREENOTES_EFFORT as Effort } : {}),
    ...(env.FREENOTES_FALLBACKS === "false" ? { fallbacks: false } : {}),
  });
}
