import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineConfig } from "vite";

// TEMPORARY (delete with tools/shots.* once the case-binding rebuild is
// documented): gives tools/shots.html somewhere to put the contact sheets it
// renders, so before/after comparisons are real files instead of transient
// canvases. Dev server only — never part of a production build.
const shotSink = {
  name: "shot-sink",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/__shot", async (request, response) => {
      if (request.method !== "POST") {
        response.statusCode = 405;
        response.end();
        return;
      }
      const name = (request.url ?? "").replace(/^\/+/, "").replace(/[^a-z0-9._-]/gi, "");
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      await mkdir("_shots", { recursive: true });
      await writeFile(join("_shots", name || "shot.png"), Buffer.concat(chunks));
      response.statusCode = 204;
      response.end();
    });
  },
};

export default defineConfig({
  plugins: [shotSink],
  publicDir: "public",
  build: {
    chunkSizeWarningLimit: 650,
  },
  server: {
    host: "127.0.0.1",
    // Honour an assigned port so a second dev server can run alongside one that
    // already holds the default; falls back to Vite's own default otherwise.
    port: Number(process.env.PORT) || undefined,
  },
});
