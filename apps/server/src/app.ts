import type { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApi, type ApiEnv, type ApiOptions } from "@freenotes/api";

export interface AppOptions extends ApiOptions {
  /** Directory with the built web app; when set it is served at "/". */
  readonly staticDir?: string;
}

/** The API plus the static web app, for running on a plain Node host. */
export function createApp(options: AppOptions): Hono<ApiEnv> {
  const app = createApi(options);
  if (options.staticDir) {
    app.use("/*", serveStatic({ root: options.staticDir }));
    app.get("*", serveStatic({ root: options.staticDir, path: "index.html" }));
  }
  return app;
}
