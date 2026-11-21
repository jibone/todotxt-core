// The Node adapter (`@jibone/todotxt-core/node`), so no read-hook
// boilerplate is needed.
//
// Run with: node examples/node/todo-node-adapter.ts
// Requires Node 22.18+ for native TypeScript type stripping.
import { createNodeTodoTxt } from "../../src/node.ts";

const todoFile = new URL("../todo.txt", import.meta.url);

// No read hook to write: the adapter reads through `node:fs/promises`.
// `encoding` (default "utf8"), `includeSource`, `caseSensitive`, and
// `logger` are the same options `createTodoTxt` accepts.
const todos = createNodeTodoTxt(todoFile, {
  includeSource: true,
});

const all = await todos.all();
console.log(`Parsed ${all.length} records.`);

console.log("\nPending:");
for (const todo of await todos.pending()) {
  const priority = todo.priority ? `(${todo.priority}) ` : "";
  // `raw` is present because includeSource is on: the exact source line.
  console.log(`  ${priority}${todo.description}`);
  console.log(`      line ${todo.line}: ${JSON.stringify(todo.raw)}`);
}

console.log(`\nCompleted: ${(await todos.completed()).length} records`);
console.log(`Projects: ${(await todos.projects()).join(", ")}`);

// Filesystem errors propagate untouched, so error-code checks keep working.
try {
  await createNodeTodoTxt(new URL("./missing.txt", import.meta.url)).all();
} catch (error) {
  console.log(`\nMissing file fails with: ${(error as { code?: string }).code}`);
}
