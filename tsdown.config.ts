import { defineConfig } from "tsdown";

// The core entry stays runtime-agnostic: no Node-specific imports, so
// `platform: "neutral"` keeps it portable to any ESM runtime. The Node
// adapter entry imports `node:fs/promises`, so it builds with
// `platform: "node"`, which externalizes the `node:` builtin.
//
// `clean` runs on the first config only: with two configs writing to the
// same `dist/`, a second clean would delete the first config's output.
export default defineConfig([
  {
    entry: ["index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    target: "es2022",
    platform: "neutral",
  },
  {
    entry: ["src/node.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    target: "es2022",
    platform: "node",
  },
]);
