# AGENTS.md

## Project
`todotxt-core` is a todo.txt parser library intended for publication as an npm package. Bun + TypeScript, ESM-only, with the core entrypoint at `index.ts`, a Node adapter subpath at `src/node.ts` (`@jibone/todotxt-core/node`), and an optional extension-tag helpers subpath at `src/ext.ts` (`@jibone/todotxt-core/ext`: opinionated `due:`/`pri:` policy, never reachable from the core entry).

Every non-empty line is parsed directly into a `TodoRecord` (JSON-friendly). There is no separate `TodoItem`/raw representation; the optional `line`/`raw` source fields are attached to records only when the caller opts in with `includeSource` (parser `ParseOptions` or client `TodoClientOptions`). `TodoRecord` is generic over its metadata (`TodoRecord<TData>`); supplying `TData` through `createTodoTxt`/`createNodeTodoTxt` types `data` for known keys and is an assertion, not a validation. `createTodoTxt()` returns a lazy, chainable query API over parsed records:

- `all()`, `pending()`, `completed()`, `project(name)`, `context(name)`
- `notProject(name)`, `notContext(name)`, `priority(letter)`, `search(text)`,
  `meta(key, value?)`, `hasMeta(key)`, and the `createdAfter`/`createdBefore`/
  `completedAfter`/`completedBefore` date filters
- `sortBy(field, direction?)`, `count()`, and `first()`
- `projects()` and `contexts()` pluck unique, alphabetically sorted names
- `summary()` returns totals plus per-project/context pending/completed
  counts; `countsByProject()` and `countsByContext()` return the per-name
  counts alone. A record tagged with several names counts once per name, so
  per-name totals do not sum to the summary total.

Warnings are available as data: `parseDocumentResult()` returns the records
plus warnings (document order, 1-based lines), `lineCount`, and `skippedLines`;
a client's `warnings()` exposes the most recent successful read's warnings as
copies. Read-hook rejections propagate untouched when they are `Error`
instances; other rejected values are wrapped in `TodoReadError` with the
original on `cause`.

Writing lives on the same client and requires the `write` hook: `add()` takes a
partial `TodoAddInput` (only `description` required), `update()` takes the full
updated JSON record, `complete()`/`uncomplete()` flip completion, and
`delete()` removes the line; all return the affected record as it now exists in
the file. todo.txt has no IDs, so a line number is the identity: write-enabled
clients attach `line` to every record they return even without `includeSource`
(`raw` still needs it). Every write re-reads current contents, splices the
physical document (only the touched line changes; untouched lines keep their
exact bytes and line endings), writes the full document through the hook, and
on success replaces the cache with a reparse of what was written; writes
serialize in call order, and a failed write leaves the cache and warnings
untouched. `complete`/`uncomplete`/`delete` verify the passed record still
matches the file and reject stale records; `update` trusts the line. Invalid
content rejects with `TypeError` before any IO — validated so the canonical
line reparses into exactly the supplied fields (`src/validate.ts`), including a
prefix round-trip guard that catches descriptions masquerading as `x`, `(A)`,
or dates. `complete()` drops the priority (completed lines never keep one) and
defaults its date to the `today` hook (the local system date). `uncomplete()`
rejects lines that would format to nothing once the marker and date are
removed (no description, creation date, or tags). `TodoWriteError`
mirrors `TodoReadError`: missing hook, unusable line, stale record, wrong
completion state, and non-Error write-hook rejections wrapped with `cause`.

Filters compose sequentially (AND across calls, OR for array arguments), the
sort step is stable with nulls last in both directions, and the client caches
the parsed records. The first query reads the file; later queries reuse that
snapshot, and `all()`/`refresh()` always reload and replace the cache while
`invalidate()` drops it so the next query re-reads; reads that settle after
invalidation never repopulate the cache, and `invalidate()` also resets
`warnings()`. `isStale()` probes staleness: `true` when no snapshot exists
(no IO) or when a fresh read's 53-bit content fingerprint (plus length,
`src/hash.ts`) differs from the snapshot's; own writes update the
fingerprint, probes run behind the write queue, and they never touch the
cache. Name matching is exact and case-sensitive by default,
overridable per call or client-wide via `caseSensitive`; `search` is
independently case-insensitive by default.

The package is published to npm as `@jibone/todotxt-core`. It is ESM-only, built
with `tsdown` into `dist/`, and ships only `dist` plus README/LICENSE. The
Node adapter (`createNodeTodoTxt`) is a subpath export that reads and writes
through `node:fs/promises`; it works under Bun too, so there is no separate Bun
subpath. `formatRecord`/`formatDocument` serialize records back to canonical
todo.txt lines: defined part order, alphabetized tags, lossy in a documented
way, stable through a reparse, and never claiming round-trip fidelity
(`todo.raw ?? formatRecord(todo)` is the idiom for exact source).

## Commands
- Install deps: `bun install`
- Typecheck: `bunx tsc` (or `bun run typecheck`; `noEmit` is set in `tsconfig.json`)
- Test: `bun test` (Bun's built-in runner, discovers `*.test.ts` / `*.spec.ts`)
- Build: `bun run build` (tsdown → `dist/index.js` + `dist/index.d.ts`, and `dist/node.mjs` + `dist/node.d.mts` for the adapter)
- Validate package: `bunx publint` and `bunx @arethetypeswrong/cli --pack . --profile esm-only`
- Run examples: `bun examples/todo-all.ts`, `bun examples/todo-project.ts`, `bun examples/todo-context.ts`, `bun examples/todo-cross.ts`, `bun examples/todo-logger.ts`, `bun examples/todo-warnings.ts`, `bun examples/todo-cache.ts`, `bun examples/todo-try.ts`, `bun examples/todo-filters.ts`, `bun examples/todo-sort.ts`, `bun examples/todo-summary.ts`, `bun examples/todo-ext.ts`, `bun examples/todo-node-adapter.ts`, `bun examples/todo-format.ts`, `bun examples/todo-add.ts`, `bun examples/todo-update.ts`, `bun examples/todo-complete.ts`, `bun examples/todo-delete.ts`; rule examples live in `examples/rules/`; Node examples are `node examples/node/todo-all.ts`, `node examples/node/todo-logger.ts`, `node examples/node/todo-node-adapter.ts`, and `node examples/node/todo-write.ts` (Node 22.18+ for type stripping).

## Gotchas
- Format interpretation is documented in `docs/todo-txt-rules.md` and codified in `src/todo-txt-rules.test.ts`; canonical output (formatting) is codified in `src/format.test.ts`. Writing behavior (validation matrix, line identity, surgical splices, completion semantics) is documented in the same doc's "Writing" section and codified in `src/write.test.ts`. Update the doc and tests when parser, formatting, or writing behavior changes.
- The client parses internally with source tracking always on: every cached record carries `line` and `raw`. `SourceExposure` in `src/clone.ts` decides what consumer-facing copies carry — `raw` needs `includeSource`, while `line` also appears on write-enabled clients. Don't parse with `includeSource: options.includeSource` again; the internal snapshot must keep source fields for writes to locate records.
- Writes never reformat the whole file: they splice the physical document through `splitDocument`/`joinDocument` in `src/write.ts`, so untouched lines keep their exact bytes and each line keeps its own terminator. Never build new contents with `formatDocument` over the cache; that would canonicalize every line.
- The build is a `tsdown` config array: the core entry uses `platform: "neutral"` and the Node adapter entry (`src/node.ts`) uses `platform: "node"`. `clean` must stay on the first config only — a second clean would delete the first entry's output before the second runs.
- There is no linter or formatter. CI runs typecheck, tests, build, and package validation from `.github/workflows/ci.yml`.
- Since this is published as a library, keep `index.ts` exporting the public API rather than running side effects when imported.
- `verbatimModuleSyntax` is enabled: use `import type` for type-only imports.
- `strict` and `noUncheckedIndexedAccess` are enabled: indexed access returns `T | undefined`, so handle it explicitly.
- Runtime and tests are Bun (`types: ["bun"]`); TypeScript 7 is a dev dependency and is run via `bunx`.

## Publishing
- Releases are manual and local. Use `bun run release <current|patch|minor|major>`
  (`--dry-run` supported). The script requires `master`, a clean and in-sync
  tree, npm auth, and GitHub CLI auth; it runs tests/typecheck/build/package
  validation, bumps the version, publishes with `npm publish`, pushes the commit
  and tag, and creates a GitHub Release with generated notes.
- Use `current` for the very first release (version already in `package.json`);
  use `patch`/`minor`/`major` afterwards.
- There is no CI publish workflow. Keep npm 2FA enabled. Manual publishes do not
  generate provenance attestations.
- `prepublishOnly` runs tests and typecheck; `prepack` runs the build.
