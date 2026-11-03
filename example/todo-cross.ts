import { createTodoTxt } from "../index.ts";
import type { TodoRecord } from "../index.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

console.log("Contexts in +GarageSale:");
printNames(await todos.project("GarageSale").contexts());

console.log("\nPending contexts in +GarageSale:");
printNames(await todos.project("GarageSale").contexts().pending());

console.log("\nCompleted contexts in +GarageSale:");
printNames(await todos.project("GarageSale").contexts().completed());

console.log("\nProjects in @home:");
printNames(await todos.context("home").projects());

console.log("\nPending projects in @home:");
printNames(await todos.context("home").projects().pending());

console.log("\nCompleted projects in @home:");
printNames(await todos.context("home").projects().completed());

console.log("\nAll +TodoTxt @computer items:");
printRecords(await todos.project("TodoTxt").context("computer"));

console.log("\nPending +TodoTxt @computer items:");
printRecords(await todos.project("TodoTxt").context("computer").pending());

console.log("\nCompleted +TodoTxt @computer items:");
printRecords(await todos.project("TodoTxt").context("computer").completed());

console.log("\nAll +GarageSale @home items:");
printRecords(await todos.project("GarageSale").context("home"));

function printNames(names: string[]): void {
  if (names.length === 0) {
    console.log("  (none)");
    return;
  }

  console.log(`  ${names.join(", ")}`);
}

function printRecords(records: TodoRecord[]): void {
  if (records.length === 0) {
    console.log("  (none)");
    return;
  }

  for (const record of records) {
    console.log(`  ${record.completed ? "x" : " "} ${record.description}`);
  }
}
