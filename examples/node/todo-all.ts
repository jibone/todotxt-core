// A read-only Node.js client.
//
// Run with: node examples/node/todo-all.ts
// Requires Node 22.18+ for native TypeScript type stripping.
import { readFile } from "node:fs/promises";
import { createTodoTxt } from "../../index.ts";

const todoFile = new URL("../todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => readFile(todoFile, "utf8"),
});

const all = await todos.all();
console.log(`Parsed ${all.length} records.`);

console.log("\nPending:");
for (const todo of await todos.pending()) {
  const priority = todo.priority ? `(${todo.priority}) ` : "";
  console.log(`  ${priority}${todo.description}`);
}

console.log(`\nCompleted: ${(await todos.completed()).length} records`);
console.log(`Projects: ${(await todos.projects()).join(", ")}`);
console.log(`Contexts: ${(await todos.contexts()).join(", ")}`);

const project = "TodoTxt";

console.log(`\n+${project}:`);
for (const todo of await todos.project(project)) {
  const marker = todo.completed ? "x" : " ";
  console.log(`  ${marker} ${todo.description}`);
}

const context = "phone";

console.log(`\n@${context}:`);
for (const todo of await todos.context(context)) {
  const marker = todo.completed ? "x" : " ";
  console.log(`  ${marker} ${todo.description}`);
}
