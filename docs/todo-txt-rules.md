# How todotxt-core parses todo.txt

`todotxt-core` follows the [todo.txt format rules](https://github.com/todotxt/todo.txt).
This document describes how each rule is interpreted and where this library is
stricter or more lenient than a literal reading of the specification.

The rules are codified in [`src/todo-txt-rules.test.ts`](../src/todo-txt-rules.test.ts).
Those tests assert complete `TodoRecord` values for canonical examples, so a
parser refactor that changes the meaning of a rule fails the suite. Runnable
versions of the examples are in [`examples/rules/`](../examples/rules/).
The reverse direction — turning records back into text — is documented in
[Formatting](#formatting-canonical-output) and codified in
[`src/format.test.ts`](../src/format.test.ts).

## Summary

| Rule | Interpretation | Stricter than the spec? |
| --- | --- | --- |
| 1. Priority | `(A)`–`(Z)` at the start of an incomplete line, followed by one literal space | Yes: lowercase, missing space, and mid-line priorities are ignored |
| 2. Creation date | `YYYY-MM-DD` immediately after the priority, or first if there is no priority | Yes: the date must exist on the calendar |
| 3. Projects and contexts | `+name` / `@name` anywhere in the text after the prefix; name is any non-whitespace run | No: start-of-text tags and any whitespace separators are accepted |
| 4. Completed tasks | Lowercase `x` followed by one literal space; optional completion date, then optional creation date | Mixed: priority after `x` is ignored, completion date is optional |
| 5. Metadata | The first colon separates a non-empty key (no colons, no whitespace) from a value with no whitespace; the value may be empty and contain colons; the `__proto__` key is reserved | Yes: malformed extensions and `__proto__` tokens stay in the description |

## Parsing order

A line is parsed in this order, after one leading byte-order mark (U+FEFF),
if present, is dropped:

1. **Completed marker**: `x ` at position 0.
2. **Completion date**: the first `YYYY-MM-DD` token, if present and valid.
3. **Creation date**: the next `YYYY-MM-DD` token, if present and valid.
4. **Priority** (incomplete lines only): `(A)` to `(Z)` at position 0.
5. **Creation date** (incomplete lines only): the first `YYYY-MM-DD` token.
6. **Text**: the remainder is split on whitespace into projects, contexts, and
   metadata.

The remainder becomes the `description` after tags and metadata are removed.

## Rule 1: priority appears first

> If priority exists, it ALWAYS appears first. The priority is an uppercase
> character from A-Z enclosed in parentheses and followed by a space.

The parser only recognizes a priority at position 0 of an incomplete line. The
letter must be uppercase `A`–`Z`, and it must be followed by a **literal ASCII
space**, not a tab.

| Input | `priority` | `description` |
| --- | --- | --- |
| `(A) Call Mom` | `"A"` | `"Call Mom"` |
| `Really gotta call Mom (A) @phone @someday` | `null` | `"Really gotta call Mom (A)"` |
| `(b) Get back to the boss` | `null` | `"(b) Get back to the boss"` |
| `(B)->Submit TPS report` | `null` | `"(B)->Submit TPS report"` |
| `(A)\tCall Mom` | `null` | `"(A) Call Mom"` |
| ` (A) Call Mom` | `null` | `"(A) Call Mom"` |
| `(A) (B) Call Mom` | `"A"` | `"(B) Call Mom"` |

Only the first priority is parsed. A task can have one priority at most.

## Rule 2: creation date directly after priority

> A task's creation date may optionally appear directly after priority and a
> space. If there is no priority, the creation date appears first.

The date must use exactly `YYYY-MM-DD` and be followed by a space or the end of
the line. This library additionally requires the date to be a real calendar
date.

| Input | `createdAt` | `description` |
| --- | --- | --- |
| `2011-03-02 Document +TodoTxt task format` | `"2011-03-02"` | `"Document task format"` |
| `(A) 2011-03-02 Call Mom` | `"2011-03-02"` | `"Call Mom"` |
| `(A) Call Mom 2011-03-02` | `null` | `"Call Mom 2011-03-02"` |
| `2011-3-2 Document the format` | `null` | `"2011-3-2 Document the format"` |
| `2011-99-99 Broken date` | `null` | `"2011-99-99 Broken date"` |
| `2011-02-29 Leap check` | `null` | `"2011-02-29 Leap check"` |

### Date validation

A date is valid when the month is `01`–`12` and the day exists in that month,
including leap-year rules for February:

- `2012-02-29` and `2000-02-29` are valid.
- `2011-02-29` and `1900-02-29` are not.
- `2011-02-30`, `2011-04-31`, and `2011-99-99` are not.

Validation is arithmetic and does not use `Date`, so it is independent of the
host timezone and never rolls `2011-02-30` over to March 2.

When a leading token has the date shape but is not a real date:

- `createdAt` or `completedAt` stays `null`.
- The token remains in the description.
- The parser emits an [`invalid-date`](#warnings) warning.
- The parser does **not** look further along the line for another date. In
  `2011-99-99 2011-03-01 Task`, `createdAt` is `null`.

A date-only line is accepted: `(A) 2011-03-02` yields `createdAt:
"2011-03-02"` and an empty description.

## Rule 3: projects and contexts

> Contexts and projects may appear anywhere in the line after
> priority/prepended date. A context is preceded by a single space and an
> at-sign (`@`). A project is preceded by a single space and a plus-sign (`+`).
> A project or context contains any non-whitespace character.

The parser tokenizes the text on whitespace. A token is a project when it starts
with `+` and has at least one more character; a context when it starts with `@`
and has at least one more character.

| Input | `projects` | `contexts` |
| --- | --- | --- |
| `(A) Call Mom +Family +PeaceLoveAndHappiness @iphone @phone` | `["Family", "PeaceLoveAndHappiness"]` | `["iphone", "phone"]` |
| `Call +driftradio @phone` | `["driftradio"]` | `["phone"]` |
| `Call +driftradio.net @email-work` | `["driftradio.net"]` | `["email-work"]` |
| `Call +drift radio` | `["drift"]` | `[]` |
| `Call @email work` | `[]` | `["email"]` |
| `Email SoAndSo at soandso@example.com` | `[]` | `[]` |
| `Learn how to add 2+2` | `[]` | `[]` |
| `Compare + and @ symbols` | `[]` | `[]` |

The name is everything after the marker up to the next whitespace. It may
contain punctuation and colons, so `+Family,` is the project `"Family,"` and
`@phone.` is the context `"phone."`.

Because tags are parsed before `key:value` metadata, a tag with a colon is still
a tag: `@foo:bar` is the context `"foo:bar"`.

A line may have zero, one, or many projects and contexts. Parsed records keep
every occurrence in source order, including duplicates. The `projects()` and
`contexts()` query plucks return unique, alphabetically sorted names.

### Deliberate leniency

The specification says a tag is "preceded by a single space". This library
accepts tags at the very start of the text and after any whitespace, including
tabs:

```text
@GroceryStore pies    → context "GroceryStore"
```

This matches how most todo.txt clients behave.

## Rule 4: completed tasks

> A completed task starts with a lowercase x character (x). If a task starts
> with an x (case-sensitive and lowercase) followed directly by a space, it is
> marked as complete.

The `x` must be lowercase and followed by a literal ASCII space. `X` and
`xylophone` are ordinary text, and so are `x\tCall Mom` and a line with leading
whitespace.

| Input | `completed` | `completedAt` | `createdAt` |
| --- | --- | --- | --- |
| `x 2011-03-03 Call Mom` | `true` | `"2011-03-03"` | `null` |
| `x 2011-03-02 2011-03-01 Review Tim's pull request +TodoTxtTouch @github` | `true` | `"2011-03-02"` | `"2011-03-01"` |
| `xylophone lesson` | `false` | `null` | `null` |
| `X 2012-01-01 Make resolutions` | `false` | `null` | `null` |
| `(A) x Find ticket prices` | `false` | `null` | `null` |

### Completion date

> The date of completion appears directly after the x, separated by a space.

The first date after `x ` is the completion date; the next date is the creation
date. Both are validated like creation dates.

The specification calls the completion date required, but this library accepts a
completed task without one:

```text
x Call Mom    → completed: true, completedAt: null
```

This keeps real-world files parseable. It also means `x 2011-03-01 Task` treats
`2011-03-01` as the completion date, not the creation date.

### Priority on completed tasks

A priority is only parsed on incomplete lines. For a completed task, the
priority position is ordinary text:

```text
x (A) 2011-03-03 Call Mom
→ priority: null, description: "(A) 2011-03-03 Call Mom"
```

The specification notes that many clients discard priority on completion and
recommend preserving it as `pri:` metadata. This parser does not infer a
priority after `x`, but it keeps `pri:A` in `data`:

```text
x 2011-03-02 2011-03-01 Task pri:A
→ data: { pri: "A" }
```

## Rule 5: extra metadata

> `key` must consist of one or more non-whitespace characters, which are not
> colons. `value` must consist of non-whitespace characters. A single colon
> separates the `key` and `value`.

A token is metadata when its first colon separates the key from the rest: the
key is one or more non-whitespace characters with no colon, and the value is
everything after that colon — non-whitespace, possibly empty, possibly
containing further colons. A token without a colon, or whose key would be
empty, is not metadata.

This follows the specification as revised in November 2026
([todotxt/todo.txt#91](https://github.com/todotxt/todo.txt/issues/91)), which
allows colons in the value precisely so a URL can be stored as metadata.

| Input | `data` | `description` |
| --- | --- | --- |
| `Pay rent due:2010-01-02 rec:1w` | `{ due: "2010-01-02", rec: "1w" }` | `"Pay rent"` |
| `Sign up url:https://example.com` | `{ url: "https://example.com" }` | `"Sign up"` |
| `Call Mom a:b:c` | `{ a: "b:c" }` | `"Call Mom"` |
| `Call Mom due:` | `{ due: "" }` | `"Call Mom"` |
| `Call Mom :value` | `{}` | `"Call Mom :value"` |
| `Call Mom key: value` | `{ key: "" }` | `"Call Mom value"` |
| `Call Mom __proto__:polluted` | `{}` | `"Call Mom __proto__:polluted"` |

Note the last row: since the value may be empty, a token like `key:` is
metadata even when more words follow it.

### URLs

A bare URL is metadata too, because its first colon separates the scheme from
the rest:

```text
Call Mom http://example.com
→ data: { http: "//example.com" }, description: "Call Mom"
```

The format defines no URL exception, and inventing one would diverge from the
rule above. To keep a URL addressable instead of swallowed, store it as a
metadata value (`url:https://example.com`, queryable with `meta("url")`) or
write it as a Markdown link (`[docs](https://example.com)`). With
`includeSource`, `raw` always carries the original line.

Metadata values are opaque. The parser does not validate date-like values, so
`due:2011-99-99` is kept as `{ due: "2011-99-99" }`.

### Duplicate keys

If a key appears more than once, the last value wins and the parser emits a
`duplicate-metadata-key` warning:

```text
Task due:2010-01-02 due:2010-02-02
→ data: { due: "2010-02-02" }
```

### Reserved keys

`__proto__` is never a metadata key. Assigning it on a plain object does not
create a property — the write goes through the prototype setter and is
silently ignored — so storing it would drop the token without a trace.
Instead the token stays in the description and the parser emits a
[`reserved-key`](#warnings) warning:

```text
task __proto__:polluted
→ data: {}, description: "task __proto__:polluted"
```

Every occurrence warns, so repeated `__proto__` tokens never produce a
`duplicate-metadata-key` warning. The key is matched exactly and
case-sensitively: `__PROTO__:x` and `proto:x` are ordinary metadata. Parsing
never modifies `Object.prototype`, whatever the input contains.

Because the token stays in the description, formatting is stable: a reparse
of formatted output keeps it in the description too.

Keys that merely name inherited properties — `constructor`, `prototype`,
`toString`, and friends — are ordinary metadata. They shadow the inherited
members on that record's `data` object, so read `data` with `Object.hasOwn`
rather than `in` or a truthiness check. The library's own `meta`, `hasMeta`,
and `sortByMeta` lookups use `Object.hasOwn` and cannot be confused by
inherited keys.

## Warnings

Warnings are non-fatal: a `TodoRecord` is always returned. Pass `onWarning` in
a `ParseOptions` object to `parseLine` or `parseDocument` to receive them;
`parseDocument` adds the 1-based physical line number. `parseDocumentResult`
returns the records, the warnings in document order, and the line counts
together as data.

| Code | Meaning | Record effect |
| --- | --- | --- |
| `duplicate-metadata-key` | The same `key:value` key appears more than once | Last value wins |
| `invalid-date` | A leading `YYYY-MM-DD` value is not a real calendar date | The value stays in the description; the date field is `null` |
| `reserved-key` | A `key:value` token uses the reserved key `__proto__` | The token stays in the description; it is not stored in `data` |

`invalid-date` metadata includes the offending value and the field that was
being parsed:

```ts
{
  code: "invalid-date",
  message: 'Invalid creation date "2011-99-99"; treating it as text.',
  meta: { value: "2011-99-99", field: "createdAt" },
}
```

A line whose first date token is invalid produces one warning, even on a
completed line where that token could otherwise be either the completion or
creation date.

## Other behaviour

- **Whitespace in the description is normalized.** Tags and metadata are
  removed, and the remaining tokens are rejoined with single spaces. Leading and
  trailing whitespace is dropped.
- **Source metadata is opt-in.** By default `TodoRecord` is a JSON-friendly
  projection and the original line is not retained. Pass
  `{ includeSource: true }` to `parseLine`, `parseDocument`, or `createTodoTxt`
  to attach `line` (the 1-based physical line number, counting blank lines) and
  `raw` (the exact line, without a trailing newline or `\r`; a leading
  byte-order mark is kept) to every record. For `parseLine`, the line number
  comes from the caller via `ParseOptions.line`.
- **A leading byte-order mark is ignored.** A UTF-8 file saved with a BOM does
  not hide the priority or dates of its first task: one leading U+FEFF is
  dropped before the line prefix is parsed. `raw` keeps the mark, so the source
  stays byte-faithful.
- **Blank lines are skipped.** `parseDocument` ignores empty and
  whitespace-only lines, and handles `\n`, `\r\n`, and lone `\r` (classic
  Mac line endings). `parseDocumentResult` counts them in `skippedLines`; its
  `lineCount` treats a trailing `\n` or lone `\r` as ending the last line
  rather than starting an empty one.
- **Completed tasks can have an empty description.** `x ` alone is complete with
  `description: ""`; a date-only line such as `(A) 2011-03-02` is valid too.

## Formatting (canonical output)

`formatRecord` and `formatDocument` turn records back into todo.txt text. The
output is **canonical, not lossless**: lines are rebuilt from the record
fields, so whatever the parser normalized is normalized in the output too.
It is also **stable**: formatting a reparse of formatted output produces the
same document, `format(parse(format(x))) === format(x)`, even though
`parse(format(x))` need not equal `x`.

A line is emitted in this order, each part only when the record has it:

```text
x <completedAt> (<priority>) <createdAt> <description> +projects @contexts key:value
```

| Property | Behavior |
| --- | --- |
| Tag order | Projects, contexts, and metadata keys are alphabetized, so equal records format to equal strings |
| Tag position | Tags reappear after the description, never at their source positions, because the parser strips them out of `description` |
| Duplicate keys | Already collapsed to the last value at parse time; one tag per key is emitted |
| Empty values | A `key:` with an empty value stays empty |
| Empty records | A record whose fields are all empty formats to `""` |

The parser never keeps a priority on a completed line (see
[Priority on completed tasks](#priority-on-completed-tasks)), so `x (A)`-shaped
output can only come from a hand-built or mutated record; formatting emits the
priority after the completion date rather than dropping it.

Because the parser preserves source order in `projects` and `contexts`, a
reparse of formatted output may list tags alphabetically instead — that lost
source order is the defined loss, and the reason no round-trip fidelity is
claimed. `formatRecord` always formats from the fields, even when `raw` is
present, so a mutated record never formats to stale text. Use the exact source
line when you have it:

```ts
const line = todo.raw ?? formatRecord(todo);
```

`formatRecord(todo, options?)` can drop tag groups: `includeProjects`,
`includeContexts`, and `includeMetadata` all default to `true`.
`formatDocument(records, options?)` formats every record with the same
options, joins the lines with `eol` (default `"\n"`, also `"\r\n"` and the
classic-Mac `"\r"`), and appends one trailing `eol`. An empty record list
formats to `""`.

## Writing

The client's write APIs — `add`, `update`, `complete`, `uncomplete`, and
`delete` — turn records back into a todo.txt document through
`formatRecord` and the consumer's `write` hook. A client created without a
`write` hook is read-only; its write methods reject with a
`TodoWriteError`.

### The write model

Every write is a read-modify-write against **current file contents**, never
the cached snapshot:

1. Re-read through the `read` hook. A failure rejects and nothing is
   written.
2. Splice the physical document: replace the target line with its
   canonical formatting, remove it, or append a new line.
3. Write the full document through the `write` hook.
4. On success, replace the cache with a reparse of the written contents, so
   the next query reflects the change without re-reading. A failed write
   leaves the cache and `warnings()` untouched; `warnings()` reflects the
   document as written.

Writes serialize through an internal queue in call order — within one
client — so concurrent mutations apply one after another. Nothing
coordinates across clients or processes: two writers on one file (two
clients, two processes, or a client and an external editor) are
last-write-wins, and a lost write surfaces no error. Use one client per
file per process, and give a custom `write` hook atomic writes — a
temporary file plus a rename — so a crash mid-write cannot truncate the
file. The bundled Node adapter already writes this way; see
[Node adapter](#node-adapter) in the README.

A query that started before the write may still resolve with the pre-write
snapshot for its own callers; the reparse still replaces the cache, so the
stale read never populates it.

### Identity is the line number

todo.txt defines no IDs, so a line is a todo's only address. Write-enabled
clients attach `line` to every record they return — even without
`includeSource`, which still controls `raw` alone — and the write APIs
locate their target by it. Writes return records carrying current lines,
so they can be chained without re-querying.

Records held from before an earlier write can go stale, because a `delete`
moves the following lines up. `complete`, `uncomplete`, and `delete` verify
that the record still matches the file and reject with a `TodoWriteError`
(re-query and retry) rather than silently touching the wrong todo.
`update` cannot tell intended changes from accidental staleness, so it
trusts the line; re-query first when the file may have moved.

The match is exact, and tag order counts: `projects` and `contexts` are
compared in the order the client reported them, so a reordered-tag record
is stale to the guarded APIs. Reorder through `update()`, which never
verifies, or re-query first. The strictness is deliberate: it catches every
change to the line, including an external edit that only shuffles tags.

### Surgical splices

Only the touched line is rewritten, canonically. Untouched lines keep
their exact bytes: blank lines survive, non-canonical tag order survives,
and a mixed-ending document keeps each line's own terminator, because the
splice works on physical lines rather than reformatting the file. A
*touched* first line loses any leading byte-order mark, since it is rebuilt
from the record fields; an untouched BOM, like every untouched byte, stays.
`add` appends at the very end of the document, after any trailing blank
lines, using the file's last seen line ending (`\n` for an empty file); a
file that ended without a trailing newline gains one before the appended
line.

### Input validation

Write content must survive the round trip: the canonical line has to
reparse into exactly the fields that produced it. Invalid content rejects
with a `TypeError` before any IO happens.

| Field | Rule | Why |
| --- | --- | --- |
| `description` | Non-empty and whitespace-normalized: non-empty tokens joined by single spaces | The parser normalizes whitespace, so anything else would not round-trip; and whitespace (including newlines) cannot be part of a physical line |
| `completedAt`, `createdAt` | `null` or a real `YYYY-MM-DD` calendar date | The record contract guarantees real dates |
| `completedAt` with `completed: false` | Rejected | The date would lead the formatted line, where it reparses as `createdAt` |
| `priority` with `completed: true` | Rejected | The parser never keeps a priority on a completed line |
| `priority` | `null` or one uppercase letter `A`–`Z` | The parser only recognizes uppercase priorities |
| `projects`/`contexts` names | Non-empty, no whitespace | Tags are whitespace-delimited tokens; a spaced name would split into several |
| `data` keys | Non-empty, no whitespace, no colon, not `__proto__` | Matches the parser's extension grammar; `__proto__` is reserved |
| `data` values | No whitespace; empty allowed | `key:` with an empty value round-trips |

Two cross-cutting rules complete the picture:

- **Prefix masquerades are caught, not corrected.** A description whose
  leading tokens would be misread as the line's prefix — `x Call Mom`,
  `(A) Call Mom`, `2011-03-02 Call Mom` on a bare pending record — rejects
  with the divergence spelled out (``the formatted line "x Call Mom"
  reparses with completed = true instead of false``). The check reparses
  the formatted line and compares the four prefix fields, so it catches
  every variant, including a completed record whose description starts
  with a real date (it would reparse as `createdAt`).
- **Tag-shaped tokens inside the description are a documented leniency.**
  The description is emitted verbatim, so `Read http://example.com` stores
  `http:` as metadata on reparse, exactly as if the line had been written
  by hand. Rejecting such text would reject ordinary URLs and clock times,
  so the write APIs leave description *tokens* alone and guard only the
  *prefix* semantics.

### Completion semantics

`complete()` rewrites the line as `x <date> …`: it sets `completed: true`,
sets `completedAt` to the explicit date argument or the client's `today`
hook (the system clock's local `YYYY-MM-DD` by default), and clears
`priority`, because a completed line never keeps one. Completing an
already-completed todo rejects with a `TodoWriteError`, as does
uncompleting a pending one. `uncomplete()` clears `completed` and
`completedAt`; a priority lost at completion time stays lost. A completed
line with no description, creation date, or tags — bare `x ` or
`x 2011-03-03` — rejects rather than becoming a blank line: with the
marker and date gone there would be no todo left to keep. The `pri:A`
metadata convention is consumer-managed: the library never writes it.

### Error taxonomy

| Error | Raised for |
| --- | --- |
| `TypeError` | Invalid content, before any IO |
| `TodoWriteError` | No `write` hook; a record without a usable `line`; a line holding no todo; a stale record; the wrong completion state, including `uncomplete()` on a line that would format to nothing; a write-hook rejection that is not an `Error` (wrapped, original on `cause`) |

Write-hook rejections that are already `Error` instances — including
filesystem errors carrying a `code` — propagate untouched, matching the
read side.

## Limits and non-goals

- **Line length is unbounded.** The parser is O(line length) and imposes no
  limit. Guarding against pathological lines is the caller's concern.
- **Whitespace is Unicode-aware in text, ASCII in prefixes.** Description
  tokenization splits on `\s+`, which includes characters like NBSP and
  U+FEFF; the priority, completion marker, and date prefixes require a
  literal ASCII space, per the format.
- **Encoding is the read hook's concern.** The parse functions take strings;
  invalid UTF-8 is surfaced or repaired by whatever produces those strings.
- **There are no comments.** The format does not define them, so a line
  starting with `#` is a task, not a comment. Supporting comment syntax is a
  non-goal.
