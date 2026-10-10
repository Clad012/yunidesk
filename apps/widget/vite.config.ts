import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build, defineConfig, type Plugin, type ViteDevServer } from "vite";
import { loaderConfig } from "./vite.loader.config";

/** Dev only: the identity secret from apps/server/.dev.vars, used to sign test user tokens. */
const DEV_IDENTITY_SECRET = "change-me-identity-secret-at-least-32-chars";

/**
 * Dev-only routes, never part of the build:
 * - /widget.js — the loader, bundled on the fly exactly like production (IIFE)
 * - /dev/token — a signed identity token for the fake host page (dev/host.html)
 */
function devRoutes(): Plugin {
  return {
    name: "yunidesk-widget-dev-routes",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://dev.local");
        try {
          if (url.pathname === "/widget.js") {
            const output = await build({ ...loaderConfig, build: { ...loaderConfig.build, write: false, minify: false } });
            const first = (Array.isArray(output) ? output[0] : output) as { output: { code?: string }[] };
            res.setHeader("content-type", "text/javascript; charset=utf-8");
            res.setHeader("cache-control", "no-store");
            res.end(first.output[0]?.code ?? "");
            return;
          }
          if (url.pathname === "/dev/token") {
            const { signUserToken } = (await server.ssrLoadModule(
              "yunidesk/identity",
            )) as typeof import("yunidesk/identity");
            const token = await signUserToken(
              {
                userId: url.searchParams.get("userId") ?? "dev-user-1",
                name: url.searchParams.get("name") ?? "Ada Lovelace",
                email: url.searchParams.get("email") ?? "ada@example.com",
                attributes: { plan: "pro", source: "dev-host" },
              },
              DEV_IDENTITY_SECRET,
              { expiresInSeconds: Number(url.searchParams.get("ttl") ?? 600) },
            );
            res.setHeader("content-type", "application/json");
            res.setHeader("cache-control", "no-store");
            res.end(JSON.stringify({ token }));
            return;
          }
        } catch (error) {
          res.statusCode = 500;
          res.end(String(error));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: "/widget/",
  plugins: [react(), tailwindcss(), devRoutes()],
  server: {
    // 127.0.0.1 answers for both http://localhost:5174 (support origin) and http://127.0.0.1:5174
    // (the fake customer site in dev/host.html), so the dev setup is really cross-origin.
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:8787", ws: true } },
  },
  build: {
    outDir: fileURLToPath(new URL("../server/public/widget", import.meta.url)),
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 0,
    rollupOptions: { input: { index: fileURLToPath(new URL("./index.html", import.meta.url)) } },
  },
});
