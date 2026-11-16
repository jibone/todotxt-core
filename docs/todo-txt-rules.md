# How todotxt-core parses todo.txt

`todotxt-core` follows the [todo.txt format rules](https://github.com/todotxt/todo.txt).
This document describes how each rule is interpreted and where this library is
stricter or more lenient than a literal reading of the specification.

The rules are codified in [`src/todo-txt-rules.test.ts`](../src/todo-txt-rules.test.ts).
Those tests assert complete `TodoRecord` values for canonical examples, so a
parser refactor that changes the meaning of a rule fails the suite. Runnable
versions of the examples are in [`examples/rules/`](../examples/rules/).

## Summary

| Rule | Interpretation | Stricter than the spec? |
| --- | --- | --- |
| 1. Priority | `(A)`–`(Z)` at the start of an incomplete line, followed by one literal space | Yes: lowercase, missing space, and mid-line priorities are ignored |
| 2. Creation date | `YYYY-MM-DD` immediately after the priority, or first if there is no priority | Yes: the date must exist on the calendar |
| 3. Projects and contexts | `+name` / `@name` anywhere in the text after the prefix; name is any non-whitespace run | No: start-of-text tags and any whitespace separators are accepted |
| 4. Completed tasks | Lowercase `x` followed by one literal space; optional completion date, then optional creation date | Mixed: priority after `x` is ignored, completion date is optional |
| 5. Metadata | `key:value` with exactly one colon, no whitespace, non-empty key and value | Yes: malformed extensions stay in the description |

## Parsing order

A line is parsed in this order:

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

> Both key and value must consist of non-whitespace characters, which are not
> colons. Only one colon separates the key and value.

A token is metadata when it contains exactly one colon, with a non-empty key and
a non-empty value, neither containing whitespace or another colon.

| Input | `data` | `description` |
| --- | --- | --- |
| `Pay rent due:2010-01-02 rec:1w` | `{ due: "2010-01-02", rec: "1w" }` | `"Pay rent"` |
| `Call Mom due:` | `{}` | `"Call Mom due:"` |
| `Call Mom :value` | `{}` | `"Call Mom :value"` |
| `Call Mom key: value` | `{}` | `"Call Mom key: value"` |
| `Call Mom a:b:c` | `{}` | `"Call Mom a:b:c"` |

A token with exactly one colon is metadata even when it looks like a URL:

```text
Call Mom http://example.com
→ data: { http: "//example.com" }, description: "Call Mom"
```

Metadata values are opaque. The parser does not validate date-like values, so
`due:2011-99-99` is kept as `{ due: "2011-99-99" }`.

### Duplicate keys

If a key appears more than once, the last value wins and the parser emits a
`duplicate-metadata-key` warning:

```text
Task due:2010-01-02 due:2010-02-02
→ data: { due: "2010-02-02" }
```

## Warnings

Warnings are non-fatal: a `TodoRecord` is always returned. Pass `onWarning` to
`parseLine` or `parseDocument` to receive them; `parseDocument` adds the 1-based
physical line number.

| Code | Meaning | Record effect |
| --- | --- | --- |
| `duplicate-metadata-key` | The same `key:value` key appears more than once | Last value wins |
| `invalid-date` | A leading `YYYY-MM-DD` value is not a real calendar date | The value stays in the description; the date field is `null` |

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
- **The raw line is not retained.** `TodoRecord` is a JSON-friendly projection,
  so writing back an exact original line is not possible.
- **Blank lines are skipped.** `parseDocument` ignores empty and
  whitespace-only lines, and handles both `\n` and `\r\n`.
- **Completed tasks can have an empty description.** `x ` alone is complete with
  `description: ""`; a date-only line such as `(A) 2011-03-02` is valid too.
