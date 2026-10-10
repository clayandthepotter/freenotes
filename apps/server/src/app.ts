import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import { DomainError, type ChiefOfStaff } from "@freenotes/core";
import { ChiefOfStaffError } from "@freenotes/ai-anthropic";
import { createChiefOfStaffHandlers, ROUTES } from "@freenotes/ai-http";

export interface AppOptions {
  readonly chiefOfStaff: ChiefOfStaff;
  /** Directory with the built web app; when set it is served at "/". */
  readonly staticDir?: string;
  readonly corsOrigin?: string;
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();
  const handlers = createChiefOfStaffHandlers(options.chiefOfStaff);

  if (options.corsOrigin) app.use("/api/*", cors({ origin: options.corsOrigin }));

  app.get(ROUTES.status, (c) => c.json(handlers.status()));
  app.post(ROUTES.refine, async (c) => c.json(await handlers.refine(await c.req.json())));
  app.post(ROUTES.plan, async (c) => c.json(await handlers.plan(await c.req.json())));
  app.post(ROUTES.report, async (c) => c.json(await handlers.report(await c.req.json())));
  app.get("/api/health", (c) => c.json({ ok: true }));

  app.onError((error, c) => {
    if (error instanceof DomainError) return c.json({ error: error.message, code: error.code }, 400);
    if (error instanceof ChiefOfStaffError) return c.json({ error: error.message, code: error.code }, error.code === "api" ? 502 : 422);
    if (error instanceof SyntaxError) return c.json({ error: "Malformed JSON body" }, 400);
    console.error(error);
    return c.json({ error: "Internal error" }, 500);
  });

  if (options.staticDir) {
    app.use("/*", serveStatic({ root: options.staticDir }));
    app.get("*", serveStatic({ root: options.staticDir, path: "index.html" }));
  }

  return app;
}
