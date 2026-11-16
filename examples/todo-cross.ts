import { createTodoTxt } from "../index.ts";
import { printNames, printRecords, section } from "./print.ts";

const todoFile = new URL("./todo.txt", import.meta.url);

const todos = createTodoTxt({
  // The library never touches the filesystem itself.
  read: () => Bun.file(todoFile).text(),
  // Not used yet, but this is where writes will go once write APIs land.
  write: (contents) => Bun.write(todoFile, contents),
});

section("Contexts in +GarageSale");
printNames(await todos.project("GarageSale").contexts());

section("Pending contexts in +GarageSale");
printNames(await todos.project("GarageSale").pending().contexts());

section("Completed contexts in +GarageSale");
printNames(await todos.project("GarageSale").completed().contexts());

section("Projects in @home");
printNames(await todos.context("home").projects());

section("Pending projects in @home");
printNames(await todos.context("home").pending().projects());

section("Completed projects in @home");
printNames(await todos.context("home").completed().projects());

section("All +TodoTxt @computer records");
printRecords(await todos.project("TodoTxt").context("computer"));

section("Pending +TodoTxt @computer records");
printRecords(await todos.project("TodoTxt").context("computer").pending());

section("Completed +TodoTxt @computer records");
printRecords(await todos.project("TodoTxt").context("computer").completed());

section("All +GarageSale @home records");
printRecords(await todos.project("GarageSale").context("home"));

section("Narrowing works in either order");
printRecords(await todos.context("home").project("GarageSale"));

section("Three filters compose");
printRecords(await todos.pending().project("OpenSource").context("github"));
