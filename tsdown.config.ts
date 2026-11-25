import { defineConfig } from "tsdown";

// The core entry stays runtime-agnostic: no Node-specific imports, so
// `platform: "neutral"` keeps it portable to any ESM runtime. The Node
// adapter entry imports `node:fs/promises`, so it builds with
// `platform: "node"`, which externalizes the `node:` builtin. The
// extension-tag helpers entry (`src/ext.ts`) is runtime-agnostic like the
// core, so it builds with `platform: "neutral"` too.
//
// `clean` runs on the first config only: with multiple configs writing to
// the same `dist/`, a later clean would delete the earlier configs' output.
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
  {
    entry: ["src/ext.ts"],
    format: ["esm"],
    dts: true,
    sourcemap: true,
    target: "es2022",
    platform: "neutral",
  },
]);
