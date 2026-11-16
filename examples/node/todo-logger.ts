// A Node.js client with read, write, and logger hooks.
//
// Run with: node examples/node/todo-logger.ts
// Requires Node 22.18+ for native TypeScript type stripping.
import { writeFile } from "node:fs/promises";
import { createTodoTxt } from "../../index.ts";
import type { TodoLogger } from "../../index.ts";

const todoFile = new URL("../todo.txt", import.meta.url);

// Bring your own logger. This one wraps console.log, but it could be pino,
// winston, a file writer, or anything else with the same signature.
const logger: TodoLogger = (level, message, meta) => {
  const line = `[todotxt:${level}] ${message}`;

  if (meta) {
    console.log(line, meta);
  } else {
    console.log(line);
  }
};

const todos = createTodoTxt({
  // Inline contents include a duplicate `due:` key to demonstrate a warning.
  read: () =>
    [
      "2011-03-02 Document +TodoTxt task format due:2011-03-05 @computer",
      "(A) Renew passport due:2024-01-01 due:2024-06-01 +Admin @home",
      "x 2011-03-03 Review Tim's pull request +TodoTxtTouch @github",
    ].join("\n"),
  // Not called yet: the write APIs will use this hook once they land.
  write: (contents) => writeFile(todoFile, contents),
  logger,
});

const records = await todos.all();
console.log(`\nParsed ${records.length} records.`);

// This query reuses the cache, so it emits no debug logs.
await todos.pending();
