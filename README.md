# todotxt-core

A parser for the [todo.txt format](https://github.com/todotxt/todo.txt).

Every non-empty line is parsed directly into a JSON-friendly `TodoRecord`. The
library performs no IO. You provide callbacks for reading and writing the file,
so it works with Bun, Node, a database, or anything else.

> [!WARNING]
> This library is under active development and is not yet recommended for
> production use. Its API may change without notice.

## Install

```sh
npm install @jibone/todotxt-core
# or
bun add @jibone/todotxt-core
```

The package has no runtime dependencies and uses no Node-specific APIs. It runs
in Node 20+, Bun, Deno, and any other runtime that can provide the read/write
hooks. Browser support is not officially targeted, but hooks can be backed by
any storage you like.

## Usage

```ts
import { createTodoTxt } from "@jibone/todotxt-core";

const todos = createTodoTxt({
  read: () => Bun.file("todo.txt").text(),
  write: (contents) => Bun.write("todo.txt", contents),
});

const records = await todos.all();

for (const todo of records) {
  console.log(todo.completed, todo.priority, todo.description);
  console.log(todo.projects, todo.contexts, todo.data);
}
```

The same client in Node, using `node:fs/promises`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import { createTodoTxt } from "@jibone/todotxt-core";

const todos = createTodoTxt({
  read: () => readFile("todo.txt", "utf8"),
  write: (contents) => writeFile("todo.txt", contents),
});
```

`write` is optional until the write APIs are implemented, so read-only clients
can omit it. `logger` is optional too and silent when omitted; see
[Logging](#logging). `includeSource` is optional as well; see
[Source metadata](#source-metadata). The runnable Node version is
[`examples/node/todo-all.ts`](https://github.com/jibone/todotxt-core/blob/master/examples/node/todo-all.ts).

`all()` returns a `TodoRecord` for each non-empty line:

| Field         | Description                                                         |
| ------------- | ------------------------------------------------------------------- |
| `completed`   | `true` when the line starts with `x `                               |
| `priority`    | Uppercase letter from `(A)`–`(Z)`, or `null`                        |
| `completedAt` | `YYYY-MM-DD` completion date that exists on the calendar, or `null` |
| `createdAt`   | `YYYY-MM-DD` creation date that exists on the calendar, or `null`   |
| `description` | Task text with projects, contexts, and `key:value` tags removed     |
| `projects`    | Projects without the `+` prefix                                     |
| `contexts`    | Contexts without the `@` prefix                                     |
| `data`        | `key:value` metadata (`{ due: "2011-03-05" }`)                      |
| `line`        | 1-based physical line number, when `includeSource` is on            |
| `raw`         | Exact original line, when `includeSource` is on                     |

If a `key:value` key appears more than once, the last value wins. With a
[logger](#logging) configured, the parser also emits a `warn` for each duplicate
key.

See [How todotxt-core parses todo.txt](https://github.com/jibone/todotxt-core/blob/master/docs/todo-txt-rules.md)
for the complete rule-by-rule interpretation, including date validation and
deliberate leniencies.

### Source metadata

By default records stay JSON-lean and the original line is not retained. Pass
`includeSource` to opt into source metadata: every record then carries `line`,
the 1-based physical line number (blank lines count), and `raw`, the exact
original line without a trailing newline or `\r`.

```ts
const todos = createTodoTxt({
  read: () => Bun.file("todo.txt").text(),
  includeSource: true,
});

for (const todo of await todos.pending()) {
  console.log(todo.line, todo.raw);
}
```

Source fields survive filters, plucks, and the cache-protecting copies that
queries return. The same option works for the standalone parser:

```ts
parseDocument(contents, { includeSource: true });
parseLine("(A) Call Mom", { includeSource: true, line: 7 });
```

`parseLine` only attaches `line` when you supply it via `ParseOptions.line`;
`parseDocument` numbers lines itself.

## Querying

Queries are lazy: chaining filters does no IO. The first query on a client reads
and parses the file once, then later queries reuse that in-memory snapshot.
Every filter operates on the array of parsed JSON records.

```ts
await todos.all();                 // TodoRecord[] (always reloads)
await todos.pending();             // TodoRecord[]
await todos.completed();           // TodoRecord[]
await todos.project("TodoTxt");    // TodoRecord[]
await todos.context("phone");      // TodoRecord[]
```

Filters compose, so they can be combined in any order:

```ts
await todos.project("TodoTxt").pending();
await todos.project("TodoTxt").context("computer");
await todos.pending().project("OpenSource").context("github");
```

### Caching and refresh

A client caches its parsed records in memory. The first query reads and parses
the file; later queries reuse the same snapshot, even if they use different
filters.

```ts
const projects = await todos.projects(); // reads and caches once

for (const project of projects) {
  const done = await todos.project(project).completed(); // cached
  const pending = await todos.project(project).pending(); // cached
}
```

`all()` always performs a fresh read and replaces the cache:

```ts
await todos.pending(); // may load the cache
await todos.all();     // always reloads
await todos.pending(); // uses the refreshed cache
```

There is no TTL or background refresh. If the file changes outside the client,
call `await todos.all()` before querying again. Returned records are independent
copies, so mutating them does not affect later queries.

### Projects and contexts

`projects()` and `contexts()` are terminal plucks. They return unique names,
alphabetically sorted.

```ts
await todos.projects();
// ["GarageSale", "Garden", "Moving", "OpenSource", "TodoTxt", "TodoTxtTouch"]

await todos.contexts();
// ["archive", "computer", "errands", "github", "hardware", "home", "phone"]

// Names from pending or completed records.
await todos.pending().projects();
await todos.completed().projects();
await todos.pending().contexts();
await todos.completed().contexts();
```

Plucks can follow any filter chain:

```ts
// Contexts used by items in a project.
await todos.project("GarageSale").contexts();
await todos.project("GarageSale").pending().contexts();
await todos.project("GarageSale").completed().contexts();

// Projects used by items in a context.
await todos.context("home").projects();
await todos.context("home").pending().projects();
await todos.context("home").completed().projects();
```

Names are matched exactly and case-sensitively. An unknown project or context
resolves to an empty array.

### Status semantics

Filters are applied in sequence:

- `pending()` keeps records that are not completed.
- `completed()` keeps records that are completed.
- `pending().completed()` therefore resolves to `[]`.
- `completed().projects()` returns projects that appear on at least one
  completed record. A project with both pending and completed items appears in
  both `pending().projects()` and `completed().projects()`.

## Logging

`createTodoTxt` is silent by default. Pass a `logger` to receive diagnostics.
It is called as `logger(level, message, meta?)`, where `level` is `"debug"`,
`"info"`, `"warn"`, or `"error"`. Bring your own implementation:

```ts
import { createTodoTxt } from "@jibone/todotxt-core";
import type { TodoLogger } from "@jibone/todotxt-core";

const logger: TodoLogger = (level, message, meta) => {
  const line = `[todotxt:${level}] ${message}`;

  if (meta) {
    console.log(line, meta);
  } else {
    console.log(line);
  }
};

const todos = createTodoTxt({
  read: () => Bun.file("todo.txt").text(),
  logger,
});
```

Currently the client emits:

- `debug` when a read starts and when it finishes, with `{ records }`.
- `warn` for each duplicate `key:value` key; the last value still wins.
- `warn` for each leading date that is not a real calendar date; the value stays
  in the description.

Cached queries do not log. Read failures stay promise rejections and are not
logged as `error`; the other levels are reserved for the write APIs. Logging is
best-effort: a logger that throws or rejects never breaks a read or query. See
`examples/todo-logger.ts`.

## Parser

The parser also works without the client wrapper:

```ts
import { parseDocument, parseLine } from "@jibone/todotxt-core";

const record = parseLine("(A) Call Mom +Family @phone due:2011-03-05");
const records = parseDocument(contents);
```

`parseLine` returns a `TodoRecord` directly. Records keep no copy of the
original line unless [source metadata](#source-metadata) is enabled. Dates must
be real calendar dates in `YYYY-MM-DD` form; a shape-valid but nonexistent date
such as `2011-99-99` is treated as text and reported as an `invalid-date`
warning. Collect warnings by passing `onWarning` in a `ParseOptions` object;
passing the handler directly as the second argument is deprecated but still
supported. The full rule-by-rule interpretation is documented in
[How todotxt-core parses todo.txt](https://github.com/jibone/todotxt-core/blob/master/docs/todo-txt-rules.md).

Writing is not implemented yet. The `write` hook is optional for now and will
become required for the write APIs when they land.

## Examples

```sh
bun examples/todo-all.ts
bun examples/todo-project.ts
bun examples/todo-context.ts
bun examples/todo-cross.ts
bun examples/todo-logger.ts
bun examples/todo-try.ts
bun examples/todo-source.ts
```

Each format rule also has a runnable example:

```sh
bun examples/rules/rule-1-priority.ts
bun examples/rules/rule-2-creation-date.ts
bun examples/rules/rule-3-projects-contexts.ts
bun examples/rules/rule-4-completed.ts
bun examples/rules/rule-5-metadata.ts
```

Node.js examples show the same API with `node:fs/promises` hooks:

```sh
node examples/node/todo-all.ts
node examples/node/todo-logger.ts
```

These require Node 22.18+ for native TypeScript type stripping; the library
itself still runs on Node 20+.

## Development

```sh
bun install
bun test
bunx tsc
bun run build
```

## Releasing

Releases are published manually from `master`:

```sh
bun run release patch     # bump and publish
bun run release minor     # or major
```

Use `bun run release current` only when `package.json` already contains a version
that has not been published yet (for example, the very first release).

The release script requires a clean, in-sync `master` plus authenticated `npm`
and `gh` CLIs. It runs the test, build, and package validation steps, then bumps
the version, publishes to npm, pushes the release commit and tag, and creates a
GitHub Release with generated notes. Add `--dry-run` to see the plan without
changing anything:

```sh
bun run release patch --dry-run
```
