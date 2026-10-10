import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { HeuristicChiefOfStaff, type ChiefOfStaff } from "@freenotes/core";
import { AnthropicChiefOfStaff, type Effort } from "@freenotes/ai-anthropic";
import { createApp } from "./app.js";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const mode = process.env.FREENOTES_AI ?? "auto";
const hasCredentials = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let chiefOfStaff: ChiefOfStaff;
if (mode === "heuristic" || (mode === "auto" && !hasCredentials)) {
  if (mode === "auto") console.warn("No ANTHROPIC_API_KEY found; serving the heuristic chief of staff.");
  chiefOfStaff = new HeuristicChiefOfStaff();
} else {
  chiefOfStaff = new AnthropicChiefOfStaff({
    ...(process.env.FREENOTES_MODEL ? { model: process.env.FREENOTES_MODEL } : {}),
    ...(process.env.FREENOTES_EFFORT ? { effort: process.env.FREENOTES_EFFORT as Effort } : {}),
    ...(process.env.FREENOTES_FALLBACKS === "false" ? { fallbacks: false } : {}),
  });
}

const staticDir = process.env.FREENOTES_WEB_DIR ?? resolve(here, "../../web/dist");
const app = createApp({
  chiefOfStaff,
  ...(existsSync(staticDir) ? { staticDir } : {}),
  ...(process.env.FREENOTES_CORS_ORIGIN ? { corsOrigin: process.env.FREENOTES_CORS_ORIGIN } : {}),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`freenotes server on http://localhost:${info.port} · chief of staff: ${chiefOfStaff.name}${existsSync(staticDir) ? ` · serving ${staticDir}` : " · web app not built"}`);
});
