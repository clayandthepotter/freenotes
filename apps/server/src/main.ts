import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { chiefOfStaffFromEnv } from "@freenotes/api";
import { createApp } from "./app.js";

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const chiefOfStaff = chiefOfStaffFromEnv(process.env, (m) => console.warn(m));
const staticDir = process.env.FREENOTES_WEB_DIR ?? resolve(here, "../../web/dist");

const app = createApp({
  chiefOfStaff,
  ...(existsSync(staticDir) ? { staticDir } : {}),
  ...(process.env.FREENOTES_CORS_ORIGIN ? { corsOrigin: process.env.FREENOTES_CORS_ORIGIN } : {}),
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`freenotes server on http://localhost:${info.port} · chief of staff: ${chiefOfStaff.name}${existsSync(staticDir) ? ` · serving ${staticDir}` : " · web app not built"}`);
});
