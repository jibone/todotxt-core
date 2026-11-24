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

The package is ESM-only: there is no CommonJS build, and if one is ever
needed it will ship as a separate build rather than a breaking conversion.
The core entry has no runtime dependencies and uses no Node-specific APIs.
It runs in Node 20+, Bun, Deno, and any other runtime that can provide the
read/write hooks. Browser support is not officially targeted, but hooks can be
backed by any storage you like. The optional [`node` adapter](#node-adapter)
is the only part that touches `node:fs/promises`, and it is a separate
subpath export.

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

In Node you can skip the hook boilerplate entirely with the
[`node` adapter](#node-adapter).

`write` is required by the [write APIs](#writing) — a client without it
stays read-only, and its write methods reject with a `TodoWriteError`.
`logger` is optional too and silent when omitted; see [Logging](#logging).
`includeSource` is optional as well; see
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
| `line`        | 1-based physical line number — when `includeSource` is on, and always on write-enabled clients (see [Writing](#writing)) |
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
queries return. On a write-enabled client (a `write` hook is supplied),
`line` is attached even without `includeSource`, because the
[write APIs](#writing) locate records by it; `raw` still requires
`includeSource`. The same option works for the standalone parser:

```ts
parseDocument(contents, { includeSource: true });
parseLine("(A) Call Mom", { includeSource: true, line: 7 });
```

`parseLine` only attaches `line` when you supply it via `ParseOptions.line`;
`parseDocument` numbers lines itself.

### Typing metadata

`data` is `Record<string, string>` by default. Consumers who know which keys
their file uses can type it with the `TData` parameter, which flows through
the client and every query:

```ts
type TaskData = Record<string, string> & { due: string; rec: string };

const todos = createTodoTxt<TaskData>({
  read: () => readFile("todo.txt", "utf8"),
});

const task = await todos.first();
task?.data.due; // string
```

`TData` is a type-level assertion, not a validation: the parser never checks
that the declared keys exist, so a missing key reads as `undefined` at
runtime. Declare it as a type with an index signature, such as
`Record<string, string> & { due: string }` or an interface extending
`Record<string, string>`; a plain interface does not satisfy the constraint.
The same parameter exists on `TodoRecord<TData>` for hand-built records, and
on `createNodeTodoTxt`.

## Node adapter

Every Node consumer otherwise writes the same `read`/`write` hook
boilerplate, so the package ships an optional subpath that supplies it:

```ts
import { createNodeTodoTxt } from "@jibone/todotxt-core/node";

const todos = createNodeTodoTxt("todo.txt");
```

The adapter reads and writes through `node:fs/promises`, so it supplies both
hooks: a client created through it is always write-enabled (see
[Writing](#writing)) and its records always carry `line`. `path` is a file
path or `URL`, passed straight to `readFile` and `writeFile`; `encoding`
selects the file's character encoding (default `"utf8"`); and
`includeSource`, `caseSensitive`, `today`, and `logger` are the same options
[`createTodoTxt`](#usage) accepts. Every client behavior — caching,
filtering, warnings, [staleness checks](#staleness-checks), serialized
writes — is unchanged.

Filesystem errors propagate untouched: `readFile` and `writeFile` reject
with `Error` instances carrying a `code` such as `ENOENT`, which the client
passes through rather than wrapping in `TodoReadError` or `TodoWriteError`:

```ts
try {
  await todos.all();
} catch (error) {
  (error as { code?: string }).code; // "ENOENT"
}
```

The same subpath works under Bun, which implements `node:fs/promises`, so no
separate Bun adapter is needed. The runnable versions are
[`examples/node/todo-node-adapter.ts`](https://github.com/jibone/todotxt-core/blob/master/examples/node/todo-node-adapter.ts)
(Node) and
[`examples/todo-node-adapter.ts`](https://github.com/jibone/todotxt-core/blob/master/examples/todo-node-adapter.ts)
(Bun).

## Querying

Queries are lazy: chaining filters does no IO. The first query on a client reads
and parses the file once, then later queries reuse that in-memory snapshot.
Every filter operates on the array of parsed JSON records. Filters compose
with AND: each call narrows the result. Array arguments are OR within a single
call, so `project(["Garden", "Moving"])` matches either name while
`project("Garden").project("Moving")` requires both.

```ts
await todos.all();                     // TodoRecord[] (always reloads)
await todos.refresh();                 // TodoRecord[] (reload, replace the cache)
todos.invalidate();                    // void (drop the cache; next query re-reads)
await todos.pending();                 // TodoRecord[]
await todos.completed();               // TodoRecord[]
await todos.project("TodoTxt");         // TodoRecord[]
await todos.context("phone");           // TodoRecord[]
await todos.priority("A");              // TodoRecord[]
await todos.search("meatballs");       // TodoRecord[]
await todos.meta("due");                // TodoRecord[]
await todos.createdAfter("2024-01-01"); // TodoRecord[]
await todos.notProject("Garden");       // TodoRecord[]
await todos.count();                   // number
await todos.first();                   // TodoRecord | undefined
await todos.summary();                 // TodoSummary
```

Filters compose, so they can be combined in any order:

```ts
await todos.project("TodoTxt").pending();
await todos.project("TodoTxt").context("computer");
await todos.pending().project("OpenSource").context("github");
await todos.priority("A").search("mom");
await todos.project(["Garden", "Moving"]).sortBy("priority");
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

`all()` and `refresh()` always perform a fresh read and replace the cache.
`refresh()` is equivalent to `all()` in effect; it exists to state the intent
and for options it may grow later:

```ts
await todos.pending();  // may load the cache
await todos.refresh();  // re-read and replace the cache
await todos.pending();  // uses the refreshed cache
```

`invalidate()` drops the cache without reading; the next query reads again:

```ts
todos.invalidate();
await todos.pending();  // reads once and caches again
await todos.completed(); // cached
```

Invalidation is safe while a read is in flight. A read that settles after
`invalidate()` still resolves for its callers, but it never repopulates the
cache — the newer read wins. Queries started before `invalidate()` may
likewise resolve with the old snapshot; both are expected. Since the snapshot
is gone, `invalidate()` also resets `warnings()` to `[]` until the next
successful read.

There is no TTL, background refresh, or file watching. If the file changes
outside the client, [`isStale()`](#staleness-checks) tells you cheaply, and
`refresh()` reloads when it does. Returned records are independent copies, so
mutating them does not affect later queries. See `examples/todo-cache.ts`.

### Staleness checks

`isStale()` answers "has the file changed outside this client?" with one read
and no reparse:

```ts
if (await todos.isStale()) {
  await todos.refresh();
}
```

- `false` after a successful read or one of this client's own writes.
- `true` when no snapshot exists — before the first read and after
  `invalidate()` — without spending a read, and when a fresh read returns
  different contents than the snapshot was built from.
- It waits for this client's queued writes to settle, so your own in-flight
  writes never look like external changes.
- It is a pure probe: the cache, `warnings()`, and in-flight reads are
  untouched.
- Read failures propagate untouched, like every read.
- It is a point-in-time check, not a subscription — poll it from your own
  timer or watcher.

Internally the snapshot keeps a 53-bit content fingerprint (plus the length)
of the exact contents it was built from — the document the client last wrote,
for a post-write snapshot — and a probe re-reads and compares. Two different
files escape detection only by matching on both length and hash, which is
practically never for todo.txt-scale files. One assumption: a post-write
snapshot trusts the `write` hook to have written what it was given. A hook
that transforms contents (`write(x)` then `read()` ≠ `x`) reports `true`
after writes until one `refresh()` settles it.

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

Names are matched exactly and case-sensitively by default. An unknown project
or context resolves to an empty array. An empty array argument also matches
nothing; see [Case-insensitive matching](#case-insensitive-matching) for the
per-call and client-wide options.

### Status semantics

Filters are applied in sequence:

- `pending()` keeps records that are not completed.
- `completed()` keeps records that are completed.
- `pending().completed()` therefore resolves to `[]`.
- `completed().projects()` returns projects that appear on at least one
  completed record. A project with both pending and completed items appears in
  both `pending().projects()` and `completed().projects()`.

### Priority, search, and metadata

```ts
await todos.priority("A");         // exactly (A); "a" matches nothing
await todos.priority(["A", "B"]);  // either letter

await todos.search("PR");                          // substring of description,
                                                   // case-insensitive by default
await todos.search("pr", { caseSensitive: true }); // exact-case substring

await todos.meta("due");                // has due, whatever the value
await todos.meta("due", "2024-04-01");  // exact value
await todos.hasMeta("due");             // same as meta("due"), more readable
```

`search` only looks at `description`. Projects, contexts, and `key:value` tags
have their own filters.

### Date filters

Date filters compare strictly against validated `YYYY-MM-DD` values, so plain
string comparison is safe. Records without the date never match. Invalid
arguments throw a `TypeError` when the query is built, before any read happens:

```ts
await todos.createdAfter("2024-01-01");   // createdAt strictly later
await todos.createdBefore("2024-01-01");  // createdAt strictly earlier
await todos.completedAfter("2024-01-01"); // completedAt strictly later
await todos.completedBefore("2024-01-01");// completedAt strictly earlier

todos.createdAfter("2024-02-30");
// TypeError: createdAfter() expected a real calendar date in YYYY-MM-DD form
```

### Negation

`notProject` and `notContext` keep the records without a name. An array
excludes every listed name; an empty array excludes nothing:

```ts
await todos.notProject("Garden");
await todos.notContext(["phone", "computer"]);
```

### Sorting

`sortBy` appends an ordering step after filtering. The sort is stable, so
records with equal keys keep file order. Missing values — `null` priorities or
dates — sort last in both directions; `"desc"` reverses only the value
comparison. The last `sortBy` or `sortByMeta` call wins.

```ts
await todos.pending().sortBy("priority");     // A first, then B–Z, no priority last
await todos.sortBy("createdAt");              // earliest first, nulls last
await todos.sortBy("completedAt", "desc");    // latest first, nulls still last
await todos.sortBy("description");            // localeCompare ordering
```

`sortByMeta(key)` orders by any `key:value` metadata value with a plain string
comparison — valid `YYYY-MM-DD` values order chronologically, and the library
favors no key. Records without the key sort last in both directions:

```ts
await todos.pending().sortByMeta("due");     // by data.due; missing last
await todos.sortByMeta("part", "desc");      // any metadata key, not just due
```

### Due dates and other extension tags

`due:`, `rec:`, `pri:` and every other `key:value` tag are tool conventions,
not part of the todo.txt format proper. The format defines exactly two dates —
the creation and completion dates — and both have first-class support: the
`createdAt`/`completedAt` record fields, the `createdAfter` / `createdBefore` /
`completedAfter` / `completedBefore` filters, and the `sortBy("createdAt")` /
`sortBy("completedAt")` orderings.

Extension values live in `data`, and behavior built on them is yours to
define. `isValidDate` is exported for that job: it checks `YYYY-MM-DD` values
arithmetically — no `Date` rollover, no timezone — exactly the check the parser
applies to the two format dates.

```ts
import { isValidDate, type TodoRecord } from "@jibone/todotxt-core";

isValidDate("2024-03-10"); // true
isValidDate("2024-02-30"); // false — shape-valid, but not a real day
```

An overdue helper, for instance, is a few lines on the generic APIs:

```ts
function isOverdue(todo: TodoRecord, today: string): boolean {
  const due = todo.data["due"];
  return !todo.completed && due !== undefined && isValidDate(due) && due < today;
}

const overdue = (await todos.pending()).filter((todo) =>
  isOverdue(todo, "2024-04-01"),
);
```

The same goes for priorities recorded as `pri:A` on completed tasks: read them
yourself, e.g. `todo.priority ?? todo.data["pri"] ?? null`.

### count() and first()

`count()` and `first()` resolve through the same loader and cache as every
other query. `first()` returns the first record of the filtered (and sorted)
result, or `undefined` when nothing matches, and it is a copy:

```ts
await todos.pending().count();                 // 12
await todos.sortBy("priority").first();        // first (A) task
await todos.project("Missing").first();        // undefined
```

### Aggregates and counts

`summary()` returns top-level totals plus per-name counts in one query, and
`countsByProject()` / `countsByContext()` return the per-name counts alone:

```ts
const summary = await todos.summary();
// {
//   total: 19, pending: 12, completed: 7,
//   projects: [
//     { name: "GarageSale",   counts: { pending: 3, completed: 1, total: 4 } },
//     { name: "Garden",       counts: { pending: 2, completed: 0, total: 2 } },
//     { name: "Moving",       counts: { pending: 1, completed: 1, total: 2 } },
//     { name: "OpenSource",   counts: { pending: 2, completed: 2, total: 4 } },
//     { name: "TodoTxt",      counts: { pending: 2, completed: 2, total: 4 } },
//     { name: "TodoTxtTouch", counts: { pending: 0, completed: 1, total: 1 } },
//   ],
//   contexts: [
//     { name: "archive",  counts: { pending: 0, completed: 2, total: 2 } },
//     { name: "computer", counts: { pending: 2, completed: 2, total: 4 } },
//     { name: "errands",   counts: { pending: 2, completed: 1, total: 3 } },
//     { name: "github",    counts: { pending: 1, completed: 2, total: 3 } },
//     { name: "hardware",  counts: { pending: 2, completed: 0, total: 2 } },
//     { name: "home",      counts: { pending: 3, completed: 1, total: 4 } },
//     { name: "phone",     counts: { pending: 2, completed: 1, total: 3 } },
//   ],
// }

await todos.countsByProject(); // summary.projects on its own
await todos.countsByContext(); // summary.contexts on its own
```

Aggregates respect filter chains, so they can be scoped like any other query:

```ts
await todos.pending().summary();              // pending records only
await todos.project("GarageSale").summary();  // one project's dashboard
```

The counting rules:

- A record tagged with several names counts once per name, so per-name
  totals do **not** sum to the top-level `total`: multi-tag records make the
  sum larger and untagged records make it smaller.
- Names are unique and alphabetically sorted, matching `projects()` and
  `contexts()`. Completed-only records still contribute their names; use
  `pending().summary()` (or `pending().countsByProject()`) to count pending
  work only.
- `sortBy` steps are ignored, like the name plucks.
- Aggregates load through the cache like every other query.

### Case-insensitive matching

Name matching is exact by default. Change the default for a whole client, or
for a single call:

```ts
const todos = createTodoTxt({
  read: () => Bun.file("todo.txt").text(),
  caseSensitive: false,
});

await todos.project("garden"); // matches +Garden
await todos.project("TodoTxt", { caseSensitive: true }); // back to exact
```

Case-insensitive comparison uses `toLowerCase()`, which is deterministic across
machines and locales but is not full Unicode case folding. `projects()` and
`contexts()` always preserve original casing. `search` is independent of this
setting: it is case-insensitive by default whatever the client says.

## Writing

Supply a `write` hook and the same client can change the file:

```ts
const todos = createTodoTxt({
  read: () => readFile("todo.txt", "utf8"),
  write: (contents) => writeFile("todo.txt", contents),
  today: () => "2026-11-22", // optional; defaults to the local system date
});

await todos.add({ description: "Call Mom", priority: "A", projects: ["Family"] });
```

Five methods, all returning the affected record as it now exists in the file:

```ts
await todos.add({ description: "Pay rent" }); // appended as one line
await todos.update(updated);                   // replace the todo at updated.line
await todos.complete(todo);                    // x + completion date (today)
await todos.complete(todo, "2026-11-20");      // x + an explicit date
await todos.uncomplete(todo);                  // drop x + the date
await todos.delete(todo);                      // remove the line
```

A client without a `write` hook is read-only; its write methods reject with
a `TodoWriteError`.

### Records locate themselves by line

todo.txt has no IDs: a line is a todo's only address. A write-enabled client
therefore attaches `line` to every record it returns — even without
`includeSource`, which still controls `raw` alone — and `update`,
`complete`, `uncomplete`, and `delete` locate their target by it. The
record each write returns carries a current `line`, so writes chain without
re-querying:

```ts
const added = await todos.add({ description: "Task" });
await todos.update({ ...added, description: "Renamed" });
```

Records held from before an earlier write can go stale — a `delete` moves
the following lines up. `complete`, `uncomplete`, and `delete` notice: they
verify the record still matches the file and reject with a `TodoWriteError`
telling you to re-query and retry, rather than silently touching the wrong
todo. `update` cannot tell your intended changes from accidental staleness,
so it trusts the line — re-query first if the file may have moved.

### Writes are surgical

Every write is a read-modify-write against current file contents: it
re-reads the file, splices the document, and writes the full result back.
Only the touched line changes; untouched lines — including blank lines,
non-canonical tag order, and per-line line endings — keep their exact
bytes. The touched line is rewritten canonically by `formatRecord`, and
`add` appends at the end of the document using the file's last seen line
ending. Writes serialize through an internal queue in call order, so
concurrent mutations apply one after another.

On success the cache becomes a reparse of the written contents, so the next
query sees the change without re-reading, and `isStale()` stays `false` — a
write refreshes the staleness fingerprint too. A failed write leaves the cache
and `warnings()` untouched, and `warnings()` reflects the document as
written.

One byte-level note: a *touched* first line loses any leading byte-order
mark, since it is rebuilt canonically from the record fields. Untouched
lines — including an untouched BOM — keep their exact bytes.

### Validation

Write content must survive the round trip: the canonical line has to
reparse into exactly the fields you supplied. Invalid content rejects with
a `TypeError` before any IO happens:

- `description` is required and must be whitespace-normalized — non-empty
  tokens joined by single spaces.
- Dates must be real calendar dates in `YYYY-MM-DD` form. `completedAt`
  requires `completed: true`, and a completed record cannot carry a
  priority: the parser drops both on reparse, so keeping them would lie.
- `priority` is `null` or one uppercase letter `A`–`Z`.
- Project, context, and metadata names cannot contain whitespace; metadata
  keys cannot contain colons and cannot be `__proto__`; metadata values
  cannot contain whitespace (empty is fine).
- A description whose leading tokens would be misread as todo.txt prefixes
  (`x Call Mom`, `(A) Call Mom`, `2011-03-02 Call Mom`) rejects with the
  divergence spelled out — without the check the line would silently flip
  `completed`, `priority`, or `createdAt` on reparse.

Tag-shaped tokens *inside* the description are the one deliberate
leniency: the description is emitted verbatim, so `Read http://example.com`
stores `http:` as metadata on reparse, exactly as if you had written that
line by hand. That is inherent to the todo.txt format; keep such text out
of descriptions if it bothers you. The complete rule-by-rule interpretation
lives in
[How todotxt-core parses todo.txt](https://github.com/jibone/todotxt-core/blob/master/docs/todo-txt-rules.md#writing).

### Completing

`complete()` marks the todo with `x` and a completion date — `today`'s
value by default, or an explicit `YYYY-MM-DD` argument — and drops the
priority, because completed lines never keep one. Pin the default for tests
with the `today` client hook (the default is the system clock's local
date, formatted without timezone conversion):

```ts
const todos = createTodoTxt({
  read: () => readFile("todo.txt", "utf8"),
  write: (contents) => writeFile("todo.txt", contents),
  today: () => "2026-11-22",
});
```

Completing an already-completed todo rejects, as does uncompleting a
pending one. `uncomplete()` removes the `x` marker and the completion date;
a priority lost at completion time stays lost. A completed line with no
description, creation date, or tags — bare `x ` or `x 2011-03-03` —
rejects rather than becoming a blank line: with the marker and date gone
there would be no todo left. Give it a description with `update()` first,
or `delete()` it. The `pri:A` metadata convention is yours to manage —
`complete()` never writes it for you.

### Write errors

- `TodoWriteError` — no `write` hook; a record without a usable `line`; a
  line that holds no todo; a record that no longer matches the file; the
  wrong completion state; a write-hook rejection that is not an `Error`
  (wrapped, with the original on `cause`). Write-hook rejections that are
  `Error` instances — including filesystem errors with a `code` such as
  `EACCES` — propagate untouched, matching the read side.
- `TypeError` — invalid content, before any IO.

See `examples/todo-add.ts`, `examples/todo-update.ts`,
`examples/todo-complete.ts`, and `examples/todo-delete.ts`.

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
- `debug` when a write starts and when it finishes, with `{ records }`.
- `warn` for each duplicate `key:value` key; the last value still wins.
- `warn` for each leading date that is not a real calendar date; the value stays
  in the description.

Cached queries do not log. Read and write failures stay promise rejections
and are not logged as `error`; that level is reserved. Logging is
best-effort: a logger that throws or rejects never breaks a read, write, or
query. See `examples/todo-logger.ts`.

Warnings are also available without a logger, as data; see
[Warnings and errors as data](#warnings-and-errors-as-data).

## Warnings and errors as data

`onWarning` callbacks and the [logger](#logging) are not the only way to learn
what was wrong with a file. `parseDocumentResult` returns the same records as
`parseDocument` plus the warnings and line counts as data:

```ts
import { parseDocumentResult } from "@jibone/todotxt-core";

const result = parseDocumentResult(contents);
// {
//   records: TodoRecord[],
//   warnings: [
//     { code: "invalid-date", message: "...", line: 3, meta: { ... } },
//     { code: "duplicate-metadata-key", message: "...", line: 4, meta: { ... } },
//   ],
//   lineCount: 4,     // physical lines; a trailing newline adds none
//   skippedLines: 1,  // blank or whitespace-only lines
// }
```

Warnings appear in document order with 1-based physical line numbers.
`lineCount` counts physical lines — a single trailing newline ends the last
line instead of starting an empty one, and the empty input has no lines.
`skippedLines` counts the blank and whitespace-only lines the parser ignored.
Warnings are still forwarded to `options.onWarning` when supplied.

Clients expose the same data without hooks. `warnings()` returns the warnings
of the most recent successful read:

```ts
const records = await todos.all();
const warnings = todos.warnings();
// ParseWarning[] in document order, or [] after a clean read.
```

It is an additional access path: the [logger](#logging) still receives the
same warnings. The returned array and its warnings are copies, so callers may
mutate them freely. A read that fails leaves the previous read's warnings in
place, `invalidate()` resets them to `[]`, and `warnings()` returns `[]`
before the first read.

### Read errors

Rejections from the `read` hook stay promise rejections. When the rejected
value is already an `Error` — including filesystem errors with a `code` such
as `ENOENT` — it propagates untouched, so existing error-code checks keep
working. A hook that rejects with anything else (a thrown string, a plain
object) is wrapped in a `TodoReadError` with the original value on `cause`:

```ts
import { TodoReadError } from "@jibone/todotxt-core";

try {
  await todos.all();
} catch (error) {
  if (error instanceof TodoReadError) {
    // The read hook rejected with a non-Error value.
    console.error(error.cause);
  }
  // A real Error (including fs errors with .code) arrives untouched.
}
```

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
warning. Collect warnings by passing `onWarning` in a `ParseOptions` object, or
get them back as data with
[`parseDocumentResult`](#warnings-and-errors-as-data); passing the handler
directly as the second argument is deprecated but still supported and will be
removed in 1.0.0. The full rule-by-rule interpretation is documented in
[How todotxt-core parses todo.txt](https://github.com/jibone/todotxt-core/blob/master/docs/todo-txt-rules.md).

### Untrusted input and resource limits

The parser imposes no size limits. It is O(line length) per line and O(file
size) overall: `parseDocument` materializes the whole document as a line
array and a records array, and each line is tokenized and rejoined, so peak
memory reaches several multiples of the input before parsing finishes. There
is no built-in guard against a pathological line or a huge file.

todo.txt files are personal, trusted input, so this is by design — see
[Limits and non-goals](https://github.com/jibone/todotxt-core/blob/master/docs/todo-txt-rules.md#limits-and-non-goals).
If a `read` hook or a string handed to `parseDocument` can come from an
untrusted source, enforce a size ceiling before handing it over:

```ts
const MAX_CHARS = 1024 * 1024;

const todos = createTodoTxt({
  read: async () => {
    const contents = await fs.readFile("todo.txt", "utf8");
    if (contents.length > MAX_CHARS) {
      throw new Error("todo.txt is suspiciously large");
    }
    return contents;
  },
});
```

Rejecting from the `read` hook surfaces through the client like any other
read failure — see [Read errors](#read-errors).

### Parsed text is not sanitized

The parser extracts text as-is: a description, a project or context name,
or a `key:value` value can contain any non-whitespace character, including
control characters such as ANSI escape sequences (`\x1b[31m`). Warning
messages and their `meta` embed keys and values from the file; the client
forwards them to the supplied `logger` and stores them for
[`warnings()`](#warnings-and-errors-as-data), and with
[source metadata](#source-metadata) the `raw` field carries the exact
original line, control bytes included.

Whitespace-delimited tokens can never contain CR or LF, and
`parseDocument` splits lines before parsing, so file content cannot forge
log lines by injecting newlines.

Consumers rendering records, warnings, or log messages to a terminal,
HTML, or a log must escape or sanitize them themselves.

## Formatting

`formatRecord` and `formatDocument` turn records back into todo.txt text for
display, export, or diffing:

```ts
import { formatDocument, formatRecord } from "@jibone/todotxt-core";

const record = parseLine("(A) 2011-03-02 Call Mom +Family @phone due:2011-03-05");

formatRecord(record);
// "(A) 2011-03-02 Call Mom +Family @phone due:2011-03-05"

formatDocument(records);                       // joined with "\n" + trailing "\n"
formatDocument(records, { eol: "\r\n" });      // CRLF instead
formatRecord(record, { includeMetadata: false }); // drop key:value tags
```

The output is canonical, not lossless. Parts emit in a defined order —
`x <completedAt> (<priority>) <createdAt> <description> +projects @contexts
key:value` — and projects, contexts, and metadata keys are alphabetized, so
records with the same fields format to the same string. Tags always reappear
after the description, never at their source positions, because the parser
strips them out of `description`. The output is stable: formatting a reparse
of formatted output produces the same document, even though the reparsed
records may list tags in a different order than the source file did.

No round-trip fidelity is claimed. `formatRecord` always formats from the
record fields, even when `raw` is present, so a mutated record never formats
to stale text. Use the exact source line when you have it:

```ts
const line = todo.raw ?? formatRecord(todo);
```

The full canonicalization rules are documented in
[How todotxt-core parses todo.txt](https://github.com/jibone/todotxt-core/blob/master/docs/todo-txt-rules.md#formatting-canonical-output).
See `examples/todo-format.ts`.

## Examples

```sh
bun examples/todo-all.ts
bun examples/todo-project.ts
bun examples/todo-context.ts
bun examples/todo-cross.ts
bun examples/todo-logger.ts
bun examples/todo-warnings.ts
bun examples/todo-cache.ts
bun examples/todo-try.ts
bun examples/todo-source.ts
bun examples/todo-filters.ts
bun examples/todo-sort.ts
bun examples/todo-summary.ts
bun examples/todo-node-adapter.ts
bun examples/todo-format.ts
bun examples/todo-add.ts
bun examples/todo-update.ts
bun examples/todo-complete.ts
bun examples/todo-delete.ts
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
node examples/node/todo-node-adapter.ts
node examples/node/todo-write.ts
```

These require Node 22.18+ for native TypeScript type stripping; the library
itself still runs on Node 20+. `todo-node-adapter.ts` uses the
[`node` adapter](#node-adapter), and `examples/todo-node-adapter.ts` runs the
same adapter under Bun. `todo-write.ts` tours the
[write APIs](#writing) against a real temp file.

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
