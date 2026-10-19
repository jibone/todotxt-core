# AGENTS.md

## Project
`todotxt-core` is a todo.txt parser library intended for publication as an npm package. Bun + TypeScript, ESM-only, with a single entrypoint at `index.ts`. The entrypoint is currently the default Bun scaffold (`console.log("Hello via Bun!")`), so the parser API still needs to be implemented and exported.

`package.json` is not publish-ready yet: it has no `version`, `description`, `exports`, or `files` fields.

## Commands
- Install deps: `bun install`
- Typecheck: `bunx tsc` (no `typecheck` script; `noEmit` is already set in `tsconfig.json`)
- Run the entrypoint: `bun run index.ts`
- Test: `bun test` (Bun's built-in runner, discovers `*.test.ts` / `*.spec.ts`). No tests exist yet, so it currently exits 1 with "0 test files".

## Gotchas
- `package.json` has no scripts, and there is no linter, formatter, build step, or CI. Don't assume commands like `bun run test` exist.
- Since this is published as a library, keep `index.ts` exporting the public API rather than running side effects when imported.
- `verbatimModuleSyntax` is enabled: use `import type` for type-only imports.
- `strict` and `noUncheckedIndexedAccess` are enabled: indexed access returns `T | undefined`, so handle it explicitly.
- Runtime and tests are Bun (`types: ["bun"]`); TypeScript 7 is a peer dependency and is run via `bunx`.

## Publishing
- No publish script or release workflow exists yet; none should be assumed.
