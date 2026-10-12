import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Emits sw.js with the build id and the full list of emitted assets, so the whole shell is precached. */
function serviceWorker(): Plugin {
  const build = Date.now().toString(36);
  return {
    name: "freenotes-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => !f.endsWith(".map"))
        .map((f) => `/${f}`);
      const precache = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", ...assets];
      const template = readFileSync(new URL("./src/sw.js", import.meta.url), "utf8");
      this.emitFile({ type: "asset", fileName: "sw.js", source: template.replaceAll("__BUILD__", build).replaceAll("__PRECACHE__", JSON.stringify(precache)) });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  define: { __FREENOTES_BUILD__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
  build: { outDir: "dist", sourcemap: true },
});
