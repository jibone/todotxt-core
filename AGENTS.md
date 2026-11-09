# AGENTS.md

## Project
`todotxt-core` is a todo.txt parser library intended for publication as an npm package. Bun + TypeScript, ESM-only, with a single entrypoint at `index.ts`.

Every non-empty line is parsed directly into a `TodoRecord` (JSON-friendly). There is no separate `TodoItem`/raw representation. `createTodoTxt()` returns a lazy, chainable query API over parsed records:

- `all()`, `pending()`, `completed()`, `project(name)`, `context(name)`
- `projects()` and `contexts()` pluck unique, alphabetically sorted names

Filters compose sequentially, and the client caches the parsed records. The first query reads the file; later queries reuse that snapshot, and `all()` always reloads and refreshes the cache.

`package.json` is not publish-ready yet: it has no `version`, `description`, `exports`, or `files` fields.

## Commands
- Install deps: `bun install`
- Typecheck: `bunx tsc` (no `typecheck` script; `noEmit` is already set in `tsconfig.json`)
- Test: `bun test` (Bun's built-in runner, discovers `*.test.ts` / `*.spec.ts`)
- Run examples: `bun example/todo-all.ts`, `bun example/todo-project.ts`, `bun example/todo-context.ts`, `bun example/todo-cross.ts`

## Gotchas
- `package.json` has no scripts, and there is no linter, formatter, or build step. CI runs typecheck and tests from `.github/workflows/ci.yml`.
- Since this is published as a library, keep `index.ts` exporting the public API rather than running side effects when imported.
- `verbatimModuleSyntax` is enabled: use `import type` for type-only imports.
- `strict` and `noUncheckedIndexedAccess` are enabled: indexed access returns `T | undefined`, so handle it explicitly.
- Runtime and tests are Bun (`types: ["bun"]`); TypeScript 7 is a peer dependency and is run via `bunx`.

## Publishing
- No publish script or release workflow exists yet; none should be assumed.
