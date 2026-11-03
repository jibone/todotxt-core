# todotxt-core

A parser for the [todo.txt format](https://github.com/todotxt/todo.txt).

The library performs no IO. You provide callbacks for reading and writing the
file, so it works with Bun, Node, a database, or anything else.

## Usage

```ts
import { createTodoTxt } from "todotxt-core";

const todos = createTodoTxt({
  read: () => Bun.file("todo.txt").text(),
  write: (contents) => Bun.write("todo.txt", contents),
});

const items = await todos.read();

for (const item of items) {
  console.log(item.completed, item.priority, item.text);
  console.log(item.projects, item.contexts, item.extensions);
}
```

`read()` returns a `TodoItem` for each non-empty line:

| Field            | Description                                                    |
| ---------------- | -------------------------------------------------------------- |
| `raw`            | The original line, without its line ending                     |
| `completed`      | `true` when the line starts with `x `                          |
| `priority`       | Uppercase letter from `(A)`–`(Z)`, or `null`                   |
| `completionDate` | `YYYY-MM-DD` completion date, or `null`                        |
| `creationDate`   | `YYYY-MM-DD` creation date, or `null`                          |
| `text`           | Task text after the `x`, priority, and date prefixes           |
| `projects`       | Projects without the `+` prefix                                |
| `contexts`       | Contexts without the `@` prefix                                |
| `extensions`     | `key:value` metadata (`{ due: "2011-03-05" }`)                 |

### Normalized records

`all()` returns a `TodoRecord` for each non-empty line, with inline metadata
separated out of the description:

```ts
const records = await todos.all();

for (const todo of records) {
  console.log(todo.completed, todo.priority, todo.description);
  console.log(todo.projects, todo.contexts, todo.data);
}
```

| Field         | Description                                                     |
| ------------- | --------------------------------------------------------------- |
| `completed`   | `true` when the line starts with `x `                           |
| `priority`    | Uppercase letter from `(A)`–`(Z)`, or `null`                    |
| `completedAt` | `YYYY-MM-DD` completion date, or `null`                         |
| `createdAt`   | `YYYY-MM-DD` creation date, or `null`                           |
| `description` | Task text with projects, contexts, and `key:value` tags removed |
| `projects`    | Projects without the `+` prefix                                 |
| `contexts`    | Contexts without the `@` prefix                                 |
| `data`        | `key:value` metadata (`{ due: "2011-03-05" }`)                  |

### Projects

Project queries are lazy: chaining filters does no IO, and awaiting a query
reads the file once.

```ts
// Unique project names, alphabetically sorted.
await todos.projects();
// ["GarageSale", "Garden", "Moving", "OpenSource", "TodoTxt", "TodoTxtTouch"]

// Projects with at least one unfinished item.
await todos.projects().pending();

// Projects whose items are all completed.
await todos.projects().completed();

// Every record in a project, pending and completed, in file order.
await todos.project("TodoTxt");

// Only pending or only completed records in a project.
await todos.project("TodoTxt").pending();
await todos.project("TodoTxt").completed();
```

A project that contains both pending and completed items is listed by
`pending()` and not by `completed()`. Project names are matched exactly and
case-sensitively; an unknown name resolves to an empty array.

### Contexts

Context queries work the same way as project queries:

```ts
// Unique context names, alphabetically sorted.
await todos.contexts();
// ["archive", "computer", "errands", "github", "hardware", "home", "phone"]

// Contexts with at least one unfinished item.
await todos.contexts().pending();

// Contexts whose items are all completed.
await todos.contexts().completed();

// Every record in a context, pending and completed, in file order.
await todos.context("phone");

// Only pending or only completed records in a context.
await todos.context("phone").pending();
await todos.context("phone").completed();
```

A context that contains both pending and completed items is listed by
`pending()` and not by `completed()`. Context names are matched exactly and
case-sensitively; an unknown name resolves to an empty array.

### Cross-filtering projects and contexts

Task queries can switch to the other dimension. These queries stay lazy and
are scoped to the current project or context:

```ts
// Contexts used by items in a project.
await todos.project("GarageSale").contexts(); // ["errands", "hardware", "home", "phone"]
await todos.project("GarageSale").contexts().pending(); // ["errands", "hardware", "phone"]
await todos.project("GarageSale").contexts().completed(); // ["home"]

// Projects used by items in a context.
await todos.context("home").projects(); // ["GarageSale", "Garden", "Moving"]
await todos.context("home").projects().pending(); // ["Garden", "Moving"]
await todos.context("home").projects().completed(); // ["GarageSale"]

// Records that are in a project and carry a context.
await todos.project("TodoTxt").context("computer");
await todos.project("TodoTxt").context("computer").pending();
await todos.project("TodoTxt").context("computer").completed();
```

Name lists are scoped to the current project or context. `pending()` keeps
names with at least one pending item in that scope, while `completed()` keeps
names whose items in that scope are all completed. A name with a mix of both is
therefore listed by `pending()` only.

Status carries across views, so `project("p").pending().contexts()` is the same
as `project("p").contexts().pending()`. The most recent `pending()` or
`completed()` call wins. The combined `project("p").context("c")` query returns
records carrying both tags, pending and completed, in file order.

The parser also works without the client wrapper:

```ts
import { parseDocument, parseLine } from "todotxt-core";

const item = parseLine("(A) Call Mom +Family @phone");
const items = parseDocument(contents);
```

Writing is not implemented yet.

## Example

```sh
bun example/todo-all.ts
bun example/todo-project.ts
bun example/todo-context.ts
bun example/todo-cross.ts
```

## Development

```sh
bun install
bun test
bunx tsc
```
