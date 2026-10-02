import { defineConfig } from "vite";

export default defineConfig({
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
