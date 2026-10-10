import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Origin is passed through untouched: the server trusts http://localhost:5173 via DEV_ORIGINS.
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
  build: {
    outDir: "../server/public",
    // The root build clears public/ first; keep widget files when building the dashboard alone.
    emptyOutDir: false,
    // One SPA bundle (~210 kB gzip); settings and contacts are split out as lazy routes.
    chunkSizeWarningLimit: 800,
  },
});
