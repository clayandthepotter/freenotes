import { chiefOfStaffFromEnv, createApi, SecretBox } from "@freenotes/api";
import { SupabaseAuthenticator, SupabaseUserSettingsRepository, supabaseConfigFromEnv } from "@freenotes/supabase";

/**
 * Vercel Function serving every /api/* route (catch-all). Vercel's Node runtime calls the
 * named HTTP-method exports with a Web `Request` and expects a Web `Response` back.
 *
 * Env: ANTHROPIC_API_KEY (operator default assistant; heuristic without it),
 * SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY + FREENOTES_KEY_SECRET (accounts and synced settings).
 */
const env = process.env;
const supabase = supabaseConfigFromEnv(env);
const keySecret = env.FREENOTES_KEY_SECRET;

const appPromise = (async () => {
  const accounts =
    supabase && keySecret
      ? {
          authenticator: new SupabaseAuthenticator(supabase),
          settings: new SupabaseUserSettingsRepository(supabase),
          secretBox: await SecretBox.fromSecret(keySecret),
        }
      : {};
  return createApi({ chiefOfStaff: chiefOfStaffFromEnv(env, (m) => console.warn(m)), ...accounts });
})();

const handler = async (request: Request): Promise<Response> => (await appPromise).fetch(request);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const OPTIONS = handler;
