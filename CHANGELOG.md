# Changelog

All notable changes to `@jibone/todotxt-core` are documented here, newest
first, one section per published version. This file is versioned with the
code: the release script refuses to publish a version that has no section
here, so any checkout of any tag answers "what changed?" without scraping
GitHub. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions before
1.0.0 are summarized tersely from their release history.

## [1.0.0] - unreleased

The first stable release. Semver applies from here: breaking changes land
in majors only, and the public surface — the core entry, the `/node` and
`/ext` subpaths, the `TodoRecord` shape, the error contract, and the
`ParseWarning` codes — is frozen.

### Breaking

- Removed the deprecated pre-1.0 surfaces (#41, #35). `parseLine` and
  `parseDocument` no longer accept an `onWarning` handler as their second
  argument — pass it in the `ParseOptions` object,
  `parseLine(line, { onWarning })` — and the `TodoFileHooks` alias is gone;
  import `TodoHooks`. Both were flagged `@deprecated` with a removal
  version of 1.0.0, and this is that removal.

### Added

- The Node adapter writes atomically (#44). Every write goes to a sibling
  temp file and is renamed over the target, so a crash mid-write can no
  longer truncate or half-write the file, and an existing target keeps its
  permissions. The rename replaces the target path itself: a symlinked
  `todo.txt` becomes a regular file on its first write.
- `formatDocument` accepts `eol: "\r"` (#45), so the formatter can emit
  the classic-Mac line endings the parser has always accepted. A pure
  type widening.

### Documentation and tooling

- The not-production-ready banner is replaced by a Stability section
  (#42): the semver scope, the public surface (the core entry, the `/node`
  and `/ext` subpaths, `TodoRecord`, the error contract, the `ParseWarning`
  codes), the deprecation policy, and the deliberate non-promises.
- The physical-line splice machinery stays internal by design (#47); the
  write APIs are the supported way to touch a todo.txt file. A post-1.0
  opt-in subpath is tracked in #50.
- CI smoke-tests the built package under Node and Deno after every build
  (#46), backing the runtime claims in the README. Bun keeps its coverage
  through the test suite.
- The README's examples list includes `todo-ext.ts` (#48).

## [0.13.0] - 2026-11-25

Pre-1.0 batch: the `/ext` subpath (`due:`/`pri:` helpers), `onLine`/`byLine`
lookups, `limit`/`offset` slices, and the documented write model
(tag-order staleness policy, record identity).

## [0.12.0] - 2026-11-23

The write APIs — `add`, `update`, `complete`, `uncomplete`, `delete` —
and the `isStale()` staleness probe.

## [0.11.0] - 2026-11-22

Security review batch: reserved `__proto__` metadata key handling,
supply-chain action pinning in CI, and the consumer documentation that
became `docs/todo-txt-rules.md`.

## [0.10.0] - 2026-11-22

The Node adapter subpath (`@jibone/todotxt-core/node`), generic metadata
typing (`TodoRecord<TData>`), and `formatRecord`/`formatDocument`.

## [0.9.0] - 2026-11-21

Parser hardening — leading BOM stripping, lone-CR line endings, metadata
spec conformance — and the `refresh()`/`invalidate()` cache lifecycle.

## [0.8.0] - 2026-11-21

Core date utilities: `isValidDate` exported from the core, plus the
key-agnostic `sortByMeta`.

## [0.7.0] - 2026-11-21

Warnings and errors as data: `parseDocumentResult()` and the client's
`warnings()`.

## [0.6.0] - 2026-11-20

Aggregates and counts: `summary()` with per-project and per-context
pending/completed counts.

## [0.5.0] - 2026-11-19

Query expressiveness: `priority()`, `search()`, metadata and date filters,
negations, `sortBy()`, `count()`, and `first()`.

## [0.4.0] - 2026-11-19

Opt-in record source metadata: `line`, `raw`, and `includeSource`.

## [0.3.0] - 2026-11-16

Calendar date validation, the documented parser rules, and runnable
examples.

## [0.2.0] - 2026-11-15

Bring-your-own logger and parse warnings.

## [0.1.1] - 2026-11-10

The manual release script (`bun run release`).

## [0.1.0] - 2026-11-10

Initial release: todo.txt parsing with hook-based file IO, the cached
chainable query API (`all()`, `project()`, `context()`), and npm
packaging.
