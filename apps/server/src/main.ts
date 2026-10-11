import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { chiefOfStaffFromEnv, FeedProxy, SecretBox } from "@freenotes/api";
import { SupabaseAuthenticator, SupabaseUserSettingsRepository, supabaseConfigFromEnv } from "@freenotes/supabase";
import { createApp } from "./app.js";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const chiefOfStaff = chiefOfStaffFromEnv(process.env, (m) => console.warn(m));
const staticDir = process.env.FREENOTES_WEB_DIR ?? resolve(here, "../../web/dist");

const supabase = supabaseConfigFromEnv(process.env);
const keySecret = process.env.FREENOTES_KEY_SECRET;
const accounts =
  supabase && keySecret
    ? {
        authenticator: new SupabaseAuthenticator(supabase),
        settings: new SupabaseUserSettingsRepository(supabase),
        secretBox: await SecretBox.fromSecret(keySecret),
      }
    : {};
if (!supabase || !keySecret) console.warn("Accounts disabled: set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and FREENOTES_KEY_SECRET to enable sign-in and synced settings.");

const app = createApp({
  chiefOfStaff,
  ...accounts,
  ...(process.env.FREENOTES_ALLOW_PRIVATE_FEEDS === "1" ? { calendarFeeds: new FeedProxy({ allowPrivate: true }) } : {}),
  ...(existsSync(staticDir) ? { staticDir } : {}),
  ...(process.env.FREENOTES_CORS_ORIGIN ? { corsOrigin: process.env.FREENOTES_CORS_ORIGIN } : {}),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `freenotes server on http://localhost:${info.port} · chief of staff: ${chiefOfStaff.name} · accounts: ${"authenticator" in accounts ? "on" : "off"}${existsSync(staticDir) ? ` · serving ${staticDir}` : " · web app not built"}`,
  );
});
