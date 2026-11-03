import { createTodoTxt } from "../index.ts";
import type { TodoRecord } from "../index.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

const context = "phone";

console.log("All contexts:", (await todos.contexts()).join(", "));
console.log("Pending contexts:", (await todos.contexts().pending()).join(", "));
console.log(
  "Completed contexts:",
  (await todos.contexts().completed()).join(", "),
);

console.log(`\nAll @${context} items:`);
printRecords(await todos.context(context));

console.log(`\nPending @${context} items:`);
printRecords(await todos.context(context).pending());

console.log(`\nCompleted @${context} items:`);
printRecords(await todos.context(context).completed());

function printRecords(records: TodoRecord[]): void {
  if (records.length === 0) {
    console.log("  (none)");
    return;
  }

  for (const record of records) {
    console.log(`  ${record.completed ? "x" : " "} ${record.description}`);
  }
}
