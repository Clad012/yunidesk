import { fileURLToPath, URL } from "node:url";
import { defineConfig, type InlineConfig } from "vite";

/** /widget.js: one small IIFE, no hash, no dependencies. Also built on the fly by the dev server. */
export const loaderConfig: InlineConfig = {
  configFile: false,
  publicDir: false,
  logLevel: "warn",
  build: {
    target: "es2019",
    outDir: fileURLToPath(new URL("../server/public", import.meta.url)),
    emptyOutDir: false,
    copyPublicDir: false,
    minify: true,
    sourcemap: false,
    lib: {
      entry: fileURLToPath(new URL("./src/loader/index.ts", import.meta.url)),
      formats: ["iife"],
      name: "YunideskLoader",
      fileName: () => "widget.js",
    },
  },
};

export default defineConfig(loaderConfig);
