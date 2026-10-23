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
await todos.projects(); // ["GarageSale", "TodoTxt"]

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
```

## Development

```sh
bun install
bun test
bunx tsc
```
