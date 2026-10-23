import { createTodoTxt } from "../index.ts";
import type { TodoRecord } from "../index.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

const project = "TodoTxt";

console.log("All projects:", (await todos.projects()).join(", "));
console.log("Pending projects:", (await todos.projects().pending()).join(", "));
console.log(
  "Completed projects:",
  (await todos.projects().completed()).join(", "),
);

console.log(`\nAll +${project} items:`);
printRecords(await todos.project(project));

console.log(`\nPending +${project} items:`);
printRecords(await todos.project(project).pending());

console.log(`\nCompleted +${project} items:`);
printRecords(await todos.project(project).completed());

function printRecords(records: TodoRecord[]): void {
  if (records.length === 0) {
    console.log("  (none)");
    return;
  }

  for (const record of records) {
    console.log(`  ${record.completed ? "x" : " "} ${record.description}`);
  }
}
