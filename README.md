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

The parser also works without the client wrapper:

```ts
import { parseDocument, parseLine } from "todotxt-core";

const item = parseLine("(A) Call Mom +Family @phone");
const items = parseDocument(contents);
```

Writing, filtering, and aggregate helpers such as listing all projects are not
implemented yet.

## Example

```sh
bun example/todo.ts
```

## Development

```sh
bun install
bun test
bunx tsc
```
