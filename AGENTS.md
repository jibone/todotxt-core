# AGENTS.md

## Project
`todotxt-core` is a todo.txt parser library intended for publication as an npm package. Bun + TypeScript, ESM-only, with a single entrypoint at `index.ts`.

Every non-empty line is parsed directly into a `TodoRecord` (JSON-friendly). There is no separate `TodoItem`/raw representation. `createTodoTxt()` returns a lazy, chainable query API over parsed records:

- `all()`, `pending()`, `completed()`, `project(name)`, `context(name)`
- `projects()` and `contexts()` pluck unique, alphabetically sorted names

Filters compose sequentially, and the client caches the parsed records. The first query reads the file; later queries reuse that snapshot, and `all()` always reloads and refreshes the cache.

The package is published to npm as `@jibone/todotxt-core`. It is ESM-only, built
with `tsdown` into `dist/`, and ships only `dist` plus README/LICENSE.

## Commands
- Install deps: `bun install`
- Typecheck: `bunx tsc` (or `bun run typecheck`; `noEmit` is set in `tsconfig.json`)
- Test: `bun test` (Bun's built-in runner, discovers `*.test.ts` / `*.spec.ts`)
- Build: `bun run build` (tsdown → `dist/index.js` + `dist/index.d.ts`)
- Validate package: `bunx publint` and `bunx @arethetypeswrong/cli --pack . --profile esm-only`
- Run examples: `bun example/todo-all.ts`, `bun example/todo-project.ts`, `bun example/todo-context.ts`, `bun example/todo-cross.ts`

## Gotchas
- There is no linter or formatter. CI runs typecheck, tests, build, and package validation from `.github/workflows/ci.yml`.
- Since this is published as a library, keep `index.ts` exporting the public API rather than running side effects when imported.
- `verbatimModuleSyntax` is enabled: use `import type` for type-only imports.
- `strict` and `noUncheckedIndexedAccess` are enabled: indexed access returns `T | undefined`, so handle it explicitly.
- Runtime and tests are Bun (`types: ["bun"]`); TypeScript 7 is a dev dependency and is run via `bunx`.

## Publishing
- `prepublishOnly` runs tests and typecheck; `prepack` runs the build.
- `.github/workflows/publish.yml` publishes on GitHub Release using npm trusted
  publishing (OIDC, no `NPM_TOKEN`).
- The first publish must be done manually after `npm login` and configuring the
  trusted publisher on npmjs.com for `jibone/todotxt-core` and `publish.yml`.
