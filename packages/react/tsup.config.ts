import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  target: "es2020",
  external: ["react"],
  // Bundling drops the per-file directives; the whole package is client-only.
  banner: { js: '"use client";' },
});
