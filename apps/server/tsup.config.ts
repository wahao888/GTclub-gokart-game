import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  platform: "node",
  target: "node20",
  clean: true,
  splitting: false,
  noExternal: ["ws", "@f1-kart/shared"],
});
