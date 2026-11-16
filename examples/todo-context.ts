import { createTodoTxt } from "../index.ts";
import { printNames, printRecords, section } from "./print.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

section("All contexts");
printNames(await todos.contexts());

section("Pending contexts");
printNames(await todos.pending().contexts());

section("Completed contexts");
printNames(await todos.completed().contexts());

const context = "phone";

section(`All @${context} records`);
printRecords(await todos.context(context));

section(`Pending @${context} records`);
printRecords(await todos.context(context).pending());

section(`Completed @${context} records`);
printRecords(await todos.context(context).completed());

section(`Projects used by @${context}`);
printNames(await todos.context(context).projects());

section(`Projects used by pending @${context} records`);
printNames(await todos.context(context).pending().projects());

section(`Projects used by completed @${context} records`);
printNames(await todos.context(context).completed().projects());

section("Context filters intersect");
printRecords(await todos.context("home").context("hardware"));

section("Context filters combine with project filters");
printRecords(await todos.context("home").project("Garden"));
